import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api";

type UseEntityDetailOptions = {
    /** Dove tornare se il caricamento fallisce con un errore diverso da 404 (un 404 mostra
     * invece "non trovato" restando sull'indirizzo: vedi `NotFoundState`). */
    backTo: string;
    /** Messaggio del toast per gli errori diversi da 404. */
    errorMessage: string;
};

export type UseEntityDetailResult<T> = {
    data: T | null;
    isLoading: boolean;
    isNotFound: boolean;
    /**
     * Ricarica: la stessa funzione che l'hook usa al montaggio e al cambio di id, quindi non
     * rifiuta mai (un errore duro riporta già all'elenco da sé) — si può passare diretta a
     * `RefreshButton` o a `Promise.all` senza un `try/catch` attorno.
     */
    reload: () => Promise<void>;
    /**
     * Scrive un dato già ottenuto altrove (tipicamente la riga che una PUT restituisce) senza
     * rifare la `fetcher`: il server l'ha già dato per buono, e una scheda che dopo ogni
     * modifica dovesse aspettare un secondo giro di rete per rivedere ciò che ha appena
     * inviato sarebbe solo più lenta. Va bene solo quando quel dato ha davvero la stessa
     * forma di `data` — non per `ReportPage`/`InterventionPage`, la cui `PUT` non restituisce
     * i nomi uniti (cliente, dispositivo, ...): lì resta `reload()`.
     */
    setData: (data: T) => void;
};

/**
 * Il caricamento di una scheda di dettaglio: id dall'indirizzo, richiesta, 404, errore.
 *
 * Le cinque schede (report, intervento, cliente, collaboratore, tecnico) riscrivevano
 * ciascuna questa logica a mano, con due difetti veri: `isNotFound` non si azzerava mai al
 * cambio di `:id` — aprendo un record valido dalla ricerca globale o dalle notifiche dopo
 * aver visto un "non trovato", la scheda restava "non trovata" anche se il nuovo id
 * esisteva — e solo due delle cinque tornavano all'elenco su un errore diverso da 404: le
 * altre tre mostravano il toast e restavano ferme su una scheda senza dati.
 */
export const useEntityDetail = <T>(
    id: string | undefined,
    fetcher: (id: number) => Promise<T>,
    { backTo, errorMessage }: UseEntityDetailOptions
): UseEntityDetailResult<T> => {
    const navigate = useNavigate();
    const numericId = Number(id);
    const isValidId = Number.isInteger(numericId) && numericId > 0;

    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(isValidId);
    const [isNotFound, setIsNotFound] = useState(!isValidId);

    // Lette da una ref, come in `usePaginatedRows`: non serve rimemoizzarle a ogni render, e
    // l'effetto sotto non deve ripartire solo perché il chiamante passa una nuova funzione
    // (o un nuovo messaggio) identici nella sostanza.
    const fetcherRef = useRef(fetcher);
    const backToRef = useRef(backTo);
    const errorMessageRef = useRef(errorMessage);
    useEffect(() => {
        fetcherRef.current = fetcher;
        backToRef.current = backTo;
        errorMessageRef.current = errorMessage;
    });

    // Identifica la richiesta più recente: una risposta che arriva dopo essere stata
    // superata da un cambio di id (o da un'altra `reload`) viene scartata, altrimenti
    // potrebbe scrivere in pagina i dati di un id che non è più quello mostrato.
    const latestRequestIdRef = useRef(0);

    const load = useCallback(async () => {
        if (!isValidId) {
            // Invalida anche una richiesta per l'id precedente ancora in volo: senza,
            // potrebbe risolversi dopo e riportare `isNotFound` a `false`.
            latestRequestIdRef.current += 1;
            setData(null);
            setIsNotFound(true);
            setIsLoading(false);
            return;
        }

        const requestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = requestId;
        setIsLoading(true);

        try {
            const result = await fetcherRef.current(numericId);

            if (requestId !== latestRequestIdRef.current) {
                return;
            }

            setData(result);
            setIsNotFound(false);
        } catch (error) {
            if (requestId !== latestRequestIdRef.current) {
                return;
            }

            if (getApiErrorStatus(error) === 404) {
                setData(null);
                setIsNotFound(true);
                return;
            }

            toast.error(getApiErrorMessage(error, errorMessageRef.current));
            navigate(backToRef.current);
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [isValidId, numericId, navigate]);

    useEffect(() => {
        // Azzera lo stato al cambio di id prima di ricaricare: senza, i dati (o il "non
        // trovato") del vecchio id restavano a schermo finché la nuova richiesta non
        // arrivava — o per sempre, se era il "non trovato" a restare e il nuovo id esisteva
        // davvero. Dentro una funzione asincrona invocata dall'effetto (non scritto in modo
        // sincrono nell'effetto stesso, che React sconsiglia) e non dentro `load`, perché
        // azzerare va fatto solo qui e non a ogni `reload()`: il pulsante Aggiorna deve poter
        // tenere i dati vecchi leggibili mentre carica quelli nuovi, come fa `usePaginatedRows`.
        void (async () => {
            setData(null);
            setIsNotFound(!isValidId);
            await load();
        })();
        // `load` cambia identità insieme a `isValidId`/`numericId`, già fra le dipendenze:
        // aggiungerlo qui ripeterebbe la stessa condizione.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isValidId, numericId]);

    return { data, isLoading, isNotFound, reload: load, setData };
};
