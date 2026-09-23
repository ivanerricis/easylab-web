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
