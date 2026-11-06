import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

/** Quante righe si disegnano subito e quante se ne aggiungono a ogni blocco. */
export const progressiveRowsBatchSize = 100;

/** Quanto prima del fondo scatta il blocco successivo: si scorre senza vedere il vuoto. */
const preloadMargin = "800px";

const storageKey = "list-rendered-rows";
const maxStoredCounts = 50;

type StoredCounts = Record<string, number>;

const readCounts = (): StoredCounts => {
    try {
        return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as StoredCounts;
    } catch {
        return {};
    }
};

const writeCount = (key: string, count: number) => {
    try {
        const counts = readCounts();
        delete counts[key];
        counts[key] = count;

        const keys = Object.keys(counts);
        for (const oldKey of keys.slice(0, Math.max(0, keys.length - maxStoredCounts))) {
            delete counts[oldKey];
        }

        sessionStorage.setItem(storageKey, JSON.stringify(counts));
    } catch {
        // Senza sessionStorage si riparte dal primo blocco, come una lista aperta da zero.
    }
};

type UseProgressiveRowsOptions<TRow> = {
    rows: TRow[];
    tableKey: string;
    /** Cambia quando la lista è un'altra (filtro, ordinamento, pagina): si riparte dal primo blocco. */
    resetKey: string | number | bigint | null;
};

/**
 * Disegna le righe a blocchi mentre si scorre invece di tutte insieme.
 *
 * Con "Tutte" la pagina riceve fino a 5000 righe in una sola richiesta, e disegnarle tutte
 * voleva dire migliaia di nodi nel DOM anche per chi guarda solo le prime. I dati arrivano
 * comunque interi (la ricerca e l'ordinamento restano del server); a blocchi va solo il disegno.
 *
 * Il blocco successivo scatta quando l'elemento sentinella, messo dopo l'ultima riga, entra
 * nella zona vicina allo schermo. Il numero di righe già disegnate si ricorda per voce di
 * cronologia, come lo scroll (`useListScrollRestoration`): senza, "Indietro" riporterebbe la
 * posizione salvata su una lista di nuovo corta, e il browser la ridurrebbe al fondo.
 *
 * Dove `IntersectionObserver` non c'è (test in jsdom, browser molto vecchi) le righe si
 * disegnano tutte, come prima.
 */
export const useProgressiveRows = <TRow>({ rows, tableKey, resetKey }: UseProgressiveRowsOptions<TRow>) => {
    const location = useLocation();
    const countKey = `${location.key}:${location.pathname}${location.search}:${tableKey}`;
    const isSupported = typeof IntersectionObserver !== "undefined";

    const [count, setCount] = useState(() => Math.max(progressiveRowsBatchSize, readCounts()[countKey] ?? 0));
    const [previousResetKey, setPreviousResetKey] = useState(resetKey);
    const [sentinel, setSentinel] = useState<Element | null>(null);

    // Si cambia stato durante il render (e non in un effetto) per non disegnare mai un frame con
    // la lista nuova e il vecchio numero di righe.
    if (resetKey !== previousResetKey) {
        setPreviousResetKey(resetKey);

        // Da vuoto a pieno è il primo caricamento: lì vale il numero ricordato.
        if (previousResetKey !== null && resetKey !== null) {
            setCount(progressiveRowsBatchSize);
        }
    }

    const hasMore = isSupported && rows.length > count;

    useEffect(() => {
        if (rows.length > progressiveRowsBatchSize) {
            writeCount(countKey, count);
        }
    }, [count, countKey, rows.length]);

    useEffect(() => {
        if (!hasMore || !sentinel) {
            return;
        }

        // L'osservatore si ricrea a ogni blocco: se la sentinella è ancora vicina allo schermo
        // dopo averlo aggiunto, la notifica iniziale fa scattare il successivo senza bisogno
        // di scroll.
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setCount((current) => current + progressiveRowsBatchSize);
                }
            },
            { rootMargin: preloadMargin }
        );
        observer.observe(sentinel);

        return () => observer.disconnect();
    }, [hasMore, sentinel, count]);

    const sentinelRef = useCallback((element: Element | null) => setSentinel(element), []);

    // Memoizzato: un array nuovo a ogni render invaliderebbe i `memo` di righe e schede.
    const visibleRows = useMemo(() => (hasMore ? rows.slice(0, count) : rows), [hasMore, rows, count]);

    return {
        visibleRows,
        hasMore,
        sentinelRef,
    };
};
