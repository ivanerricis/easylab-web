import { startTransition, useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import type { PaginatedResponse } from "@/lib/api/client";

type UsePaginatedRowsOptions<TRow> = {
    /**
     * Esegue la richiesta per i parametri correnti. Non serve memoizzarla: viene
     * letta da una ref, quindi è sempre la versione dell'ultimo render.
     *
     * Il `signal` va inoltrato alla funzione di lista, che lo passa ad axios: è quello che
     * permette di *annullare* davvero la richiesta superata invece di limitarsi a
     * ignorarne la risposta (vedi sotto).
     */
    fetchRows: (signal: AbortSignal) => Promise<PaginatedResponse<TRow>>;
    /** Parametri che identificano la richiesta: al loro cambio la lista si ricarica. */
    queryKey: DependencyList;
    /** Messaggio mostrato se la richiesta fallisce. */
    errorMessage: string;
    /** Alcune pagine partono senza skeleton perché montano già con dei filtri. */
    initialLoading?: boolean;
};

export const usePaginatedRows = <TRow>({
    fetchRows,
    queryKey,
    errorMessage,
    initialLoading = true,
}: UsePaginatedRowsOptions<TRow>) => {
    const [rows, setRows] = useState<TRow[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(initialLoading);

    const fetchRowsRef = useRef(fetchRows);
    const errorMessageRef = useRef(errorMessage);

    // Dichiarato prima dell'effetto di caricamento così la ref è già aggiornata
    // quando quest'ultimo parte.
    useEffect(() => {
        fetchRowsRef.current = fetchRows;
        errorMessageRef.current = errorMessage;
    });

    // Identifica la richiesta più recente: le risposte che arrivano dopo essere
    // state superate da una richiesta più nuova vengono scartate, altrimenti una
    // risposta lenta sovrascriverebbe la tabella con dati non più validi
    // (visibile digitando in fretta nella ricerca).
    const latestRequestIdRef = useRef(0);

    /**
     * Annulla per davvero la richiesta superata, invece di limitarsi a scartarne la
     * risposta.
     *
     * La guardia sull'id qui sopra basta alla correttezza, ma non ferma il lavoro già
     * avviato: digitando "mario" partivano cinque ricerche e il server le eseguiva tutte
     * fino in fondo, comprese le quattro di cui nessuno avrebbe letto il risultato — e una
     * ricerca libera sui report è, oggi, la query più cara dell'applicazione. Con l'abort
     * la connessione viene chiusa e Postgres interrompe la query in corso.
     *
     * Viene annullata anche la richiesta ancora in volo allo smontaggio del componente:
     * cambiare pagina mentre una lista sta caricando è il caso più comune di tutti.
     */
    const inFlightRef = useRef<AbortController | null>(null);

    const reload = useCallback(async () => {
        const requestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = requestId;

        inFlightRef.current?.abort();
        const controller = new AbortController();
        inFlightRef.current = controller;

        setIsLoading(true);

        try {
            const response = await fetchRowsRef.current(controller.signal);

            if (requestId !== latestRequestIdRef.current) {
                return;
            }

            setRows(response.items);
            setTotalItems(response.totalItems);
            setTotalPages(response.totalPages);
        } catch (error) {
            // `signal.aborted` va controllato a parte e non basta l'id: la richiesta
            // annullata allo smontaggio *è* ancora la più recente, quindi senza questo
            // ramo l'annullamento verrebbe scambiato per un errore di rete e mostrerebbe
            // un avviso rosso a chi ha semplicemente cambiato pagina.
            if (controller.signal.aborted || requestId !== latestRequestIdRef.current) {
                return;
            }

            toast.error(getApiErrorMessage(error, errorMessageRef.current));
        } finally {
            if (!controller.signal.aborted && requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        startTransition(() => {
            void reload();
        });
        // Le dipendenze sono fornite dal chiamante tramite queryKey.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, queryKey);

    useEffect(
        () => () => {
            inFlightRef.current?.abort();
        },
        []
    );

    const updateRow = useCallback((matches: (row: TRow) => boolean, updater: (row: TRow) => TRow) => {
        setRows((currentRows) => currentRows.map((row) => (matches(row) ? updater(row) : row)));
    }, []);

    return {
        rows,
        totalItems,
        totalPages,
        isLoading,
        reload,
        updateRow,
    };
};
