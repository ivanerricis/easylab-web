import axios from "axios";

const apiBaseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export const api = axios.create({
    baseURL: apiBaseURL,
    withCredentials: true,
});

/**
 * Chi ascolta una sessione scaduta o revocata (401 fuori da `/auth/`, vedi sotto). Lo
 * registra `AuthProvider`, l'unico che sa come azzerare l'utente — `client.ts` non conosce
 * React e non potrebbe portare da solo al login, ma può avvisare chi ci riesce.
 *
 * Prima non esisteva: un 401 restava dentro al `catch` di chi aveva fatto la richiesta, che
 * mostrava il proprio toast ("Sessione scaduta o non valida", dal backend) e si fermava lì.
 * L'app restava "autenticata" — `AuthProvider` legge l'utente solo al montaggio — e nessuna
 * azione portava più al login finché non si ricaricava la pagina a mano.
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
    unauthorizedHandler = handler;
};

/**
 * Le rotte di autenticazione rispondono 401 anche a sessione valida — o meglio, prima che
 * ce ne sia una: login con password sbagliata, verifica 2FA con codice sbagliato, e
 * `/auth/me` al montaggio quando non si è ancora entrati. Non è una sessione scaduta da
 * qualcun altro, è il modo normale in cui queste rotte dicono "non sei dentro": lo gestisce
 * già chi le chiama (`LoginPage`, `AuthProvider.refresh`), e non deve intervenire anche
 * l'interceptor, altrimenti un login sbagliato azzererebbe l'utente e un digitare
 * un url nella pagina di login non sarebbe mai raggiungibile.
 */
const isAuthRoute = (url: string | undefined) => (url ?? "").startsWith("/auth/");

/**
 * Un solo avviso, non uno nuovo: l'interceptor non mostra un proprio toast, si limita ad
 * azzerare l'utente (che porta al login via `RequireAuth`). Il toast che l'azione fallita
 * mostra già per conto suo (dal `catch` di chi l'ha chiamata) resta l'unico — aggiungerne un
 * secondo qui vorrebbe dire due avvisi per lo stesso 401, e con più richieste in volo
 * (dashboard, liste, notifiche) una raffica di avvisi identici.
 */
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401 && !isAuthRoute(error.config?.url)) {
            unauthorizedHandler?.();
        }

        return Promise.reject(error);
    }
);

export type EntityWithRawTimestamps<T> = Omit<T, "createdAt" | "updatedAt"> & {
    created_at: string;
    updated_at: string | null;
};

export type PaginatedResponse<T> = {
    items: T[];
    totalItems: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export const mapEntityTimestamps = <T extends { created_at: string; updated_at: string | null }>(entity: T) => {
    const { created_at, updated_at, ...rest } = entity;

    return {
        ...rest,
        createdAt: created_at,
        updatedAt: updated_at,
    };
};

/** I parametri che tutte le liste paginate delle anagrafiche accettano. */
export type EntityListParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    /**
     * Annulla la richiesta quando il chiamante la supera con una più recente o smonta la
     * pagina: senza, il server porta comunque a termine una lista che nessuno leggerà.
     * Lo fornisce `usePaginatedRows`.
     */
    signal?: AbortSignal;
};

type EntityApiOptions<ListParams> = {
    /**
     * Parametri di query propri di un'anagrafica, in coda a pagina e ricerca: oggi solo
     * l'ordinamento dei clienti. Una funzione e non un elenco di chiavi, così ogni modulo
     * decide da sé come tradurre i suoi parametri senza che la fabbrica li conosca.
     */
    extraListParams?: (params: ListParams) => Record<string, unknown>;
};

/**
 * Le chiamate CRUD di un'anagrafica (clienti, collaboratori, tecnici, dispositivi, problemi):
 * la controparte nel frontend di `createCrudRouter` del backend, che espone per tutte le stesse
 * rotte con lo stesso contratto.
 *
 * Prima ognuno dei cinque moduli ripeteva a mano la stessa lista sovraccaricata, lo stesso
 * `pageSize ?? 1000`, lo stesso `search.trim()` e la stessa rinomina dei timestamp: una
 * correzione a una di queste regole andava ricordata cinque volte, e una anagrafica che se ne
 * discostava per sbaglio non si notava. I moduli restano, con gli stessi nomi esportati
 * (`listDevices`, `getCustomer`, ...), così chi li usa non cambia.
 */
export const createEntityApi = <
    Dto extends { createdAt: string; updatedAt: string | null },
    CreateInput,
    UpdateInput = Partial<CreateInput>,
    ListParams extends EntityListParams = EntityListParams,
>(
    path: string,
    options: EntityApiOptions<ListParams> = {}
) => {
    type RawDto = EntityWithRawTimestamps<Dto>;

    // `mapEntityTimestamps` restituisce proprio la forma del DTO, ma su un tipo generico
    // TypeScript non riesce a dimostrarlo da solo: il cast è confinato qui.
    const toDto = (raw: RawDto) => mapEntityTimestamps(raw) as unknown as Dto;

    /** L'elenco completo, senza paginazione: serve ai select dei moduli (dispositivi, problemi...). */
    const listAll = async (): Promise<Dto[]> => (await api.get<RawDto[]>(path)).data.map((row) => toDto(row));

    const listPage = async (params: ListParams): Promise<PaginatedResponse<Dto>> => {
        const response = await api.get<PaginatedResponse<RawDto>>(path, {
            params: {
                page: params.page ?? 1,
                pageSize: params.pageSize ?? 1000,
                // Una ricerca di soli spazi non deve filtrare: il parametro sparisce dalla query.
                search: params.search?.trim() || undefined,
                ...options.extraListParams?.(params),
            },
            signal: params.signal,
        });

        return {
            ...response.data,
            items: response.data.items.map((row) => toDto(row)),
        };
    };

    // Senza parametri l'array nudo, con i parametri la pagina: la stessa doppia forma che
    // accetta il backend, tenuta in un solo punto.
    function list(): Promise<Dto[]>;
    function list(params: ListParams): Promise<PaginatedResponse<Dto>>;
    function list(params?: ListParams) {
        return params ? listPage(params) : listAll();
    }

    return {
        list,
        /** Solo la forma paginata: per le anagrafiche troppo grandi da scaricare intere (i clienti). */
        listPage,
        get: async (id: number) => toDto((await api.get<RawDto>(`${path}/${id}`)).data),
        create: async (payload: CreateInput) => toDto((await api.post<RawDto>(path, payload)).data),
        update: async (id: number, payload: UpdateInput) =>
            toDto((await api.put<RawDto>(`${path}/${id}`, payload)).data),
        remove: async (id: number) => toDto((await api.delete<RawDto>(`${path}/${id}`)).data),
    };
};
