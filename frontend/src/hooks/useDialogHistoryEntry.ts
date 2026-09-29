import { useEffect, useEffectEvent, useRef } from "react";

/**
 * "Indietro" (il tasto di Android, il pulsante laterale del mouse, la freccia del browser) con un
 * dialogo aperto chiude il dialogo, invece di cambiare pagina sotto di lui: su telefono il gesto
 * istintivo per uscire da una finestra è proprio quello, e prima portava via dalla lista con il
 * modulo ancora aperto (e i dati scritti persi senza domanda).
 *
 * Il meccanismo: all'apertura il dialogo aggiunge una voce alla cronologia, con lo stesso
 * indirizzo e lo stesso stato di React Router più il proprio id in `dialogEntries`. "Indietro"
 * toglie quella voce: il `popstate` atterra su una voce che non contiene più l'id, e il dialogo
 * sa che deve chiudersi. Alla chiusura normale (Annulla, Salva, Esc) la voce, rimasta in cima,
 * si consuma con `history.back()`: il router vede tornare la stessa voce di prima (stessa
 * `key`, stesso indirizzo), quindi liste, filtri e posizione di scorrimento non si accorgono di
 * niente.
 */
const stateKey = "dialogEntries";

type BackHandler = () => void;

/** Id unici anche fra un caricamento della pagina e l'altro: la cronologia sopravvive al reload. */
let entryCounter = 0;
const createEntryId = () => `${Date.now().toString(36)}-${(entryCounter += 1)}`;

/** I dialoghi aperti, nell'ordine di apertura: l'ultimo è quello in primo piano. */
const openEntries = new Map<string, BackHandler>();
/** Le voci dei dialoghi appena chiusi, da consumare (vedi `flushReleasedEntries`). */
const releasedEntries = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let isListening = false;

const entriesIn = (state: unknown): string[] => {
    const value = state && typeof state === "object" ? (state as Record<string, unknown>)[stateKey] : undefined;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
};

const pushEntry = (id: string) => {
    const state: unknown = window.history.state;
    const baseState = state && typeof state === "object" ? state : {};
    // Lo stato di React Router (`usr`, `key`, `idx`) si copia così com'è: tornando su questa voce
    // o su quella sotto, il router ritrova la stessa pagina e non la tratta come una nuova.
    window.history.pushState({ ...baseState, [stateKey]: [...entriesIn(state), id] }, "");
};

/**
 * Un solo ascoltatore per tutti i dialoghi. Ogni dialogo aperto la cui voce non c'è più nella
 * voce d'arrivo è stato "superato" da un Indietro, e si chiude; gli altri (quello sotto, quando
 * si chiude un dialogo aperto da un altro dialogo) restano come sono. Dal più recente.
 */
const handlePopState = () => {
    const present = new Set(entriesIn(window.history.state));

    for (const [id, onBack] of [...openEntries].reverse()) {
        if (!present.has(id)) {
            onBack();
        }
    }
};

const ensureListening = () => {
    if (!isListening) {
        window.addEventListener("popstate", handlePopState);
        isListening = true;
    }
};

/**
 * Consuma in un colpo solo le voci dei dialoghi chiusi che stanno in cima alla cronologia
 * (anche più d'una, se si chiudono insieme un dialogo e quello aperto da lui). Restituisce
 * quante voci ha tolto.
 *
 * Una voce che non è più in cima si lascia stare: vuol dire che dopo la chiusura è già
 * arrivata una navigazione (es. `navigate()` verso la scheda appena creata), e un `back()` la
 * annullerebbe. Resta una voce doppia della pagina di prima, innocua.
 */
const flushReleasedEntries = () => {
    clearTimeout(flushTimer);
    flushTimer = undefined;

    const entries = entriesIn(window.history.state);
    let count = 0;

    while (count < entries.length && releasedEntries.has(entries[entries.length - 1 - count])) {
        count += 1;
    }

    releasedEntries.clear();

    if (count > 0) {
        window.history.go(-count);
    }

    return count;
};

const releaseEntry = (id: string) => {
    releasedEntries.add(id);
    // Un giro dopo, non subito: chi chiude il dialogo e poi naviga nello stesso gestore
    // (`setOpen(false); navigate(...)`) ha già spinto la sua voce quando questo parte, e la
    // nostra non è più in cima. Serve anche allo StrictMode, che smonta e rimonta gli effetti:
    // il rimontaggio ritrova la voce ancora lì e la riprende (vedi `useDialogHistoryEntry`).
    flushTimer ??= setTimeout(flushReleasedEntries, 0);
};

/**
 * Per chi, dopo aver chiuso un dialogo, torna indietro nella cronologia (`navigate(-1)`): senza
 * aspettare, quel passo indietro toglierebbe la voce del dialogo invece della pagina, e non
 * succederebbe niente di visibile. Va attesa dopo la chiusura e prima della navigazione:
 *
 *     setIsOpen(false);
 *     await settleDialogHistory();
 *     navigate(-1);
 *
 * Una navigazione in avanti (`navigate("/…")`) non ne ha bisogno.
 */
export const settleDialogHistory = async () => {
    // Il tempo che React chiuda il dialogo e ne rilasci la voce.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await new Promise<void>((resolve) => {
        const timeout = setTimeout(done, 1000);

        function done() {
            clearTimeout(timeout);
            window.removeEventListener("popstate", done);
            resolve();
        }

        window.addEventListener("popstate", done);

        if (flushReleasedEntries() === 0) {
            done();
        }
    });
};

/**
 * Tiene una voce della cronologia finché il dialogo è aperto (vedi il commento in cima).
 *
 * `onBack` è chiamato quando "Indietro" toglie la voce. Se restituisce `true` il dialogo resta
 * aperto (modifiche non salvate, operazione in corso) e la voce si rimette, così il prossimo
 * Indietro fa di nuovo la stessa domanda invece di uscire dalla pagina.
 */
export const useDialogHistoryEntry = (open: boolean, onBack: () => boolean) => {
    const handleBack = useEffectEvent(onBack);
    const entryIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        let id = entryIdRef.current;
        const entries = entriesIn(window.history.state);

        if (id != null && releasedEntries.has(id) && entries.at(-1) === id) {
            // StrictMode (o un rimontaggio nello stesso giro): la voce è ancora in cima, si riprende.
            releasedEntries.delete(id);
        } else {
            id = createEntryId();
            entryIdRef.current = id;
            pushEntry(id);
        }

        const entryId = id;
        openEntries.set(entryId, () => {
            if (handleBack()) {
                pushEntry(entryId);
            }
        });
        ensureListening();

        return () => {
            openEntries.delete(entryId);
            releaseEntry(entryId);
        };
    }, [open]);
};
