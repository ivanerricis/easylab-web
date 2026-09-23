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
    /**
     * La pagina richiesta, se il chiamante la tiene fuori da questo hook (nell'indirizzo, o
     * in uno stato suo). Facoltativa: senza, l'hook si comporta come prima e non guarda
     * mai `totalPages`.
     *
     * Con `onPageOutOfRange` permette di correggere da sé una pagina che non esiste più —
     * l'unica riga dell'ultima pagina eliminata, o un filtro che ha ridotto i risultati —
     * invece di restare su una tabella vuota con l'impaginazione sparita (`totalPages <= 1`
     * la nasconde, quindi da lì non si torna indietro).
     */
    page?: number;
    /** Chiamato con l'ultima pagina valida quando `page` supera `totalPages` della risposta. */
    onPageOutOfRange?: (lastPage: number) => void;
};

export const usePaginatedRows = <TRow>({
    fetchRows,
    queryKey,
    errorMessage,
    initialLoading = true,
    page,
    onPageOutOfRange,
}: UsePaginatedRowsOptions<TRow>) => {
    const [rows, setRows] = useState<TRow[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(initialLoading);
    // Distingue il primo caricamento dalle ricariche successive: sono due stati che
    // vogliono due segnali diversi, e prima erano lo stesso `isLoading` per entrambi.
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    const fetchRowsRef = useRef(fetchRows);
    const errorMessageRef = useRef(errorMessage);
    const pageRef = useRef(page);
    const onPageOutOfRangeRef = useRef(onPageOutOfRange);

    // Dichiarato prima dell'effetto di caricamento così la ref è già aggiornata
    // quando quest'ultimo parte.
    useEffect(() => {
        fetchRowsRef.current = fetchRows;
        errorMessageRef.current = errorMessage;
        pageRef.current = page;
        onPageOutOfRangeRef.current = onPageOutOfRange;
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

            // La pagina chiesta non esiste più (`totalPages` è sempre almeno 1: vedi
            // `crudRouter.ts`): l'ultima riga della pagina è stata eliminata, o un filtro ha
            // ridotto i risultati. Il chiamante corregge la pagina, il che cambia la sua
            // `queryKey` e fa ripartire da sé un nuovo caricamento — qui non si rilancia
            // `reload` direttamente, altrimenti userebbe ancora la pagina vecchia.
            const requestedPage = pageRef.current;
            if (requestedPage != null && requestedPage > response.totalPages) {
                onPageOutOfRangeRef.current?.(response.totalPages);
            }
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
                setHasLoadedOnce(true);
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

    return {
        rows,
        totalItems,
        totalPages,
        isLoading,
        /**
         * Primo caricamento: non c'è ancora niente in tabella, quindi ci va lo scheletro delle
         * righe — che occupa lo spazio che i dati occuperanno, invece di lasciare un vuoto che
         * poi salta.
         *
         * Non è `isLoading && !hasLoadedOnce` ma il solo `!hasLoadedOnce`, perché fra il
         * montaggio e il momento in cui la richiesta parte davvero c'è una finestra in cui
         * `isLoading` è ancora falso: misurata, dura un fotogramma sull'elenco report, ed è
         * quanto basta a far comparire "Nessun report disponibile." un istante prima dei dati.
         * Chi monta con `initialLoading: false` lo fa proprio perché la richiesta parte subito.
         */
        isInitialLoading: !hasLoadedOnce,
        /**
         * Ricarica con dati già in pagina: ricerca, filtro, cambio pagina, pulsante Aggiorna.
         * Qui i dati vecchi restano visibili e leggibili. Prima anche questo caso alzava un velo
         * sfocato su tutta la pagina, campo di ricerca compreso: digitando, il velo compariva a
         * ogni pausa di battitura (300ms di debounce) e rendeva il campo non cliccabile.
         */
        isRefetching: isLoading && hasLoadedOnce,
        reload,
    };
};
