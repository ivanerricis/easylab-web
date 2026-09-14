import type { Page, Route } from "@playwright/test";

/**
 * Un backend finto dentro il browser: ogni richiesta a `/api` passa da qui.
 *
 * Le risposte predefinite bastano a far girare il guscio dell'app (utente, notifiche, stato
 * dell'aggiornamento, dati dell'azienda) e restituiscono elenchi vuoti; ogni test aggiunge o
 * sostituisce solo quelle che gli interessano. Le richieste che nessuna risposta copre
 * vengono annotate in `unhandled`: i test controllano che resti vuoto, così un mock
 * dimenticato non si traveste da pagina vuota.
 */
export type ApiHandler = (request: { url: URL; body: unknown; route: Route }) => unknown | Promise<unknown>;

/** Una risposta con stato diverso da 200. */
export class ApiResponse {
    readonly status: number;
    readonly body: unknown;

    constructor(status: number, body: unknown) {
        this.status = status;
        this.body = body;
    }
}

export const user = {
    id: 2,
    username: "mario",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
    twoFactorSetupRequired: false,
};

/** La forma delle risposte paginate; senza `page` fra i parametri il backend risponde con l'array. */
const listOrPage = (url: URL, items: unknown[]) =>
    url.searchParams.has("page")
        ? { items, totalItems: items.length, page: 1, pageSize: items.length || 10, totalPages: 1 }
        : items;

const defaultHandlers = (loggedIn: boolean): Record<string, ApiHandler> => ({
    "GET /api/auth/me": () => (loggedIn ? user : new ApiResponse(401, { message: "Autenticazione richiesta" })),
    "GET /api/settings/update-state": () => ({ state: "idle" }),
    "GET /api/notifications": () => [],
    "GET /api/settings/company": () => ({ name: "Laboratorio Prova", email: "", address: "", phone: "" }),
    "GET /api/settings/logo": () => ({ hasCustomLogo: false, updatedAt: null }),
    "GET /api/reports/stats": () => ({
        openCount: 0,
        closedCount: 0,
        monthlyRevenue: 0,
        monthlyNetRevenue: 0,
        series: [],
    }),
    "GET /api/interventions/stats": () => ({ programmatoCount: 0, inLavorazioneCount: 0, completatoCount: 0 }),
    "GET /api/interventions": ({ url }) => listOrPage(url, []),
    "GET /api/reports": ({ url }) => listOrPage(url, []),
    "GET /api/customers": ({ url }) => listOrPage(url, []),
    "GET /api/collaborators": ({ url }) => listOrPage(url, []),
    "GET /api/technicians": ({ url }) => listOrPage(url, []),
    "GET /api/devices": ({ url }) => listOrPage(url, []),
    "GET /api/issues": ({ url }) => listOrPage(url, []),
});

export type MockApi = {
    /** Richieste arrivate senza una risposta preparata, come "METODO /percorso". */
    unhandled: string[];
    /** Le richieste ricevute per una chiave, con il corpo già decodificato. */
    calls: (key: string) => unknown[];
};

export const mockApi = async (
    page: Page,
    { loggedIn = true, handlers = {} }: { loggedIn?: boolean; handlers?: Record<string, ApiHandler> } = {}
): Promise<MockApi> => {
    const allHandlers = { ...defaultHandlers(loggedIn), ...handlers };
    const unhandled: string[] = [];
    const received = new Map<string, unknown[]>();

    // Il logo è un'immagine servita dal backend: un pixel trasparente basta.
    await page.route("**/assets/logo.jpg", (route) =>
        route.fulfill({
            contentType: "image/png",
            body: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
                "base64"
            ),
        })
    );

    // Un predicato e non il glob `**/api/**`: quello prenderebbe anche i moduli che Vite serve
    // da `/src/lib/api/`, e l'app non partirebbe nemmeno.
    await page.route(
        (url) => url.pathname.startsWith("/api/"),
        async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const key = `${request.method()} ${url.pathname}`;
            const handler = allHandlers[key];
            const body = request.postDataJSON() as unknown;

            received.set(key, [...(received.get(key) ?? []), body]);

            if (!handler) {
                unhandled.push(key);
                await route.fulfill({ status: 404, json: { message: `Nessun mock per ${key}` } });
                return;
            }

            const result = await handler({ url, body, route });

            if (result instanceof ApiResponse) {
                await route.fulfill({ status: result.status, json: result.body });
                return;
            }

            await route.fulfill({ status: 200, json: result ?? {} });
        }
    );

    return { unhandled, calls: (key) => received.get(key) ?? [] };
};
