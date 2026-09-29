import { useRef, useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";

type Options<T, R> = {
    /** L'azione vera e propria, sull'elemento scelto all'apertura del dialogo. */
    run: (item: T) => Promise<R>;
    /**
     * L'avviso dopo un esito positivo. Una funzione quando il testo dipende dall'elemento o
     * dalla risposta (il nome dell'utente, il messaggio del server sull'email inviata). Senza,
     * nessun avviso: "Rigenera password" mostra il risultato in un dialogo suo.
     */
    successMessage?: string | ((item: T, result: R) => string);
    /** Il testo di ripiego se l'errore non ne porta uno del server (vedi `getApiErrorMessage`). */
    errorMessage: string;
    /**
     * Quello che segue un esito positivo, a dialogo già chiuso: ricaricare la lista, aggiornare
     * la riga, tornare indietro. Sta dentro lo stesso `try`, come stava nei blocchi scritti a
     * mano: se fallisce compare `errorMessage`, e il pulsante resta occupato finché non finisce.
     */
    onDone?: (item: T, result: R) => Promise<unknown> | void;
    /**
     * Al posto dell'avviso d'errore, per chi deve mostrarlo altrove (la password rifiutata va
     * sotto il campo, non in un toast). Riceve il testo già risolto; il dialogo resta aperto.
     */
    onError?: (message: string, error: unknown, item: T) => void;
};

/**
 * Il giro "conferma, esegui, avvisa, chiudi" dei dialoghi di conferma: l'elemento in attesa (il
 * dialogo è aperto se e solo se c'è), l'azione in corso, la protezione dal doppio invio e i due
 * avvisi. Lo stesso blocco era scritto a mano undici volte (eliminazioni delle liste e delle
 * schede, invio email, le azioni sugli utenti), parola per parola a meno dei testi.
 *
 * Restituisce già i pezzi che `ConfirmDeleteDialog` e `CustomDialog` si aspettano: `isOpen` e
 * `onOpenChange` per il dialogo, `confirm` per il pulsante, `isRunning` per spegnerlo.
 */
export const usePendingAction = <T = void, R = unknown>({
    run,
    successMessage,
    errorMessage,
    onDone,
    onError,
}: Options<T, R>) => {
    // Un contenitore e non l'elemento nudo: così anche un'azione senza elemento (`T = void`,
    // l'eliminazione dalla scheda) distingue "aperto" da "chiuso".
    const [slot, setSlot] = useState<{ item: T } | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    // Lo stato arriva al prossimo render: un secondo clic (o Ctrl+Invio) nello stesso istante
    // leggerebbe ancora `false` e lancerebbe l'azione due volte. Il ref cambia subito.
    const runningRef = useRef(false);

    const open = (item: T) => setSlot({ item });
    const close = () => setSlot(null);

    const confirm = async () => {
        if (!slot || runningRef.current) {
            return;
        }

        const { item } = slot;

        try {
            runningRef.current = true;
            setIsRunning(true);
            const result = await run(item);

            if (successMessage != null) {
                toast.success(typeof successMessage === "function" ? successMessage(item, result) : successMessage);
            }

            setSlot(null);
            await onDone?.(item, result);
        } catch (error) {
            const message = getApiErrorMessage(error, errorMessage);

            if (onError) {
                onError(message, error, item);
            } else {
                toast.error(message);
            }
        } finally {
            runningRef.current = false;
            setIsRunning(false);
        }
    };

    return {
        pending: slot ? slot.item : null,
        isOpen: slot != null,
        isRunning,
        open,
        close,
        /** Per `onOpenChange` dei dialoghi: si aprono solo con `open`, qui arriva la chiusura. */
        onOpenChange: (nextOpen: boolean) => {
            if (!nextOpen) {
                close();
            }
        },
        confirm,
    };
};
