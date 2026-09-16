import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/** I nomi dei parametri comuni a tutte le liste: stanno qui perché li scrive più di una pagina. */
export const listUrlParams = {
    search: "q",
    page: "page",
    sort: "sort",
    dateFrom: "from",
    dateTo: "to",
} as const;

/** Un valore da scrivere nell'indirizzo; `null` (o stringa vuota) toglie il parametro. */
type ParamChanges = Record<string, string | null | undefined>;

const parsePage = (value: string | null) => {
    const page = Number(value);

    return Number.isInteger(page) && page > 1 ? page : 1;
};

/**
 * Legge un parametro che può valere solo alcune cose: tutto il resto (un link vecchio, un
 * valore scritto a mano) ricade sul default invece di arrivare all'API.
 */
export const readEnumParam = <T extends string>(
    searchParams: URLSearchParams,
    key: string,
    allowed: readonly T[],
    fallback: T
): T => {
    const value = searchParams.get(key);

    return allowed.includes(value as T) ? (value as T) : fallback;
};

/** Una data `AAAA-MM-GG`, oppure niente: stesso formato che usano i filtri per data. */
export const readDateParam = (searchParams: URLSearchParams, key: string) => {
    const value = searchParams.get(key);

    return value != null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
};

/**
 * Lo stato di una lista — filtri, ordinamento, ricerca, pagina — tenuto nell'indirizzo invece
 * che nello stato del componente.
 *
 * Prima stava in `useState`, quindi viveva quanto la pagina: aprire un report e tornare
 * indietro rimontava la lista da zero, e chi aveva cercato "Rossi" ed era a pagina 3 si
 * ritrovava a pagina 1 senza ricerca. Nell'indirizzo lo stato sopravvive al "Indietro" del
 * browser, a un ricaricamento, e si può mandare a un collega come link.
 *
 * Le scritture usano `replace`: cambiare filtro non aggiunge una voce alla cronologia,
 * altrimenti "Indietro" ripercorrerebbe ogni tasto premuto nella ricerca invece di tornare
 * alla pagina precedente.
 *
 * Ogni modifica che non riguarda la pagina la riporta alla prima, nella stessa scrittura: è la
 * regola che prima applicava `useTablePagination` durante il render, ma l'indirizzo non si
 * può cambiare durante il render, e due scritture separate si sovrascriverebbero (il
 * `setSearchParams` di React Router non accoda gli aggiornamenti come `setState`).
 */
export const useListUrlState = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const updateParams = useCallback(
        (changes: ParamChanges) => {
            setSearchParams(
                (previous) => {
                    const next = new URLSearchParams(previous);

                    for (const [key, value] of Object.entries(changes)) {
                        if (value == null || value === "") {
                            next.delete(key);
                        } else {
                            next.set(key, value);
                        }
                    }

                    if (!(listUrlParams.page in changes)) {
                        next.delete(listUrlParams.page);
                    }

                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const setCurrentPage = useCallback(
        (page: number) => updateParams({ [listUrlParams.page]: page > 1 ? String(page) : null }),
        [updateParams]
    );

    return {
        searchParams,
        updateParams,
        currentPage: parsePage(searchParams.get(listUrlParams.page)),
        setCurrentPage,
        /** Per chi cambia qualcosa che non sta nell'indirizzo (le righe per pagina). */
        resetPage: useCallback(() => updateParams({}), [updateParams]),
    };
};

/**
 * Il testo di ricerca di una lista: quello che si sta scrivendo resta nel componente, e
 * nell'indirizzo arriva solo dopo la pausa di battitura.
 *
 * Il campo non può leggere direttamente dall'indirizzo: la navigazione è asincrona, e un
 * campo controllato che si aggiorna in ritardo perde lettere e sposta il cursore. Per lo
 * stesso motivo il valore "ufficiale" — quello da mandare all'API — è `committed`, che è già
 * rallentato: gli hook delle righe non fanno un secondo debounce.
 *
 * Se l'indirizzo cambia da fuori (un link, "Indietro", la ricerca globale che porta qui con
 * `?q=`), il campo si riallinea.
 */
export const useUrlSearchText = (committed: string, commit: (value: string) => void) => {
    const [draft, setDraft] = useState(committed);
    const debouncedDraft = useDebouncedValue(draft);
    const [previousCommitted, setPreviousCommitted] = useState(committed);

    if (committed !== previousCommitted) {
        setPreviousCommitted(committed);

        // Se coincide con il testo appena rallentato, il cambio l'abbiamo scritto noi.
        if (committed !== debouncedDraft) {
            setDraft(committed);
        }
    }

    // Un evento e non una dipendenza: l'effetto deve partire quando cambia il testo scritto,
    // non quando cambia l'indirizzo. Con `committed` fra le dipendenze, un cambio da fuori
    // arriverebbe mentre il testo rallentato è ancora quello vecchio, e lo riscriverebbe.
    const commitIfChanged = useEffectEvent((value: string) => {
        if (value !== committed) {
            commit(value);
        }
    });

    useEffect(() => {
        commitIfChanged(debouncedDraft);
    }, [debouncedDraft]);

    return [draft, setDraft] as const;
};
