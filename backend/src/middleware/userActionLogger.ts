import type { NextFunction, Request, Response } from "express";
import { appendUserActionLog, getDayKey } from "../services/logManager";
// Prima qui c'era una copia locale che prendeva la prima entry di X-Forwarded-For: un
// valore scrivibile dal chiamante, quindi un IP a piacere nel registro delle azioni.
// Un log di controllo falsificabile da chi lo dovrebbe incriminare non serve a niente.
import { getClientIp } from "./clientIp";

const actionVerbByMethod: Record<string, string> = {
    POST: "creato",
    PUT: "modificato",
    PATCH: "modificato",
    DELETE: "eliminato",
};

const formatAction = (method: string, normalizedPath: string) => {
    const verb = actionVerbByMethod[method] ?? `eseguito ${method}`;
    return `${verb} ${normalizedPath}`;
};

const trackedMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Etichette dedicate per le rotte dove il verbo generico (creato/modificato/eliminato)
 * racconta la cosa sbagliata — "creato /api/auth/logout" non vuol dire niente — o dove la
 * rotta è una GET che altrimenti non verrebbe mai tracciata. Ogni voce sostituisce
 * `formatAction`; l'esito (riuscito o no) resta nello status accanto, non qui.
 */
const actionLabelRules: { method: string; match: string | RegExp; label: string }[] = [
    { method: "POST", match: "/api/auth/login", label: "tentativo di accesso" },
    { method: "POST", match: "/api/auth/login/2fa", label: "verifica codice 2FA in accesso" },
    { method: "POST", match: "/api/auth/logout", label: "disconnessione" },
    { method: "PUT", match: "/api/auth/password", label: "cambio password" },
    { method: "POST", match: "/api/auth/2fa/setup", label: "avvio configurazione 2FA" },
    { method: "POST", match: "/api/auth/2fa/enable", label: "attivazione 2FA" },
    { method: "DELETE", match: "/api/auth/2fa", label: "disattivazione 2FA" },
    { method: "POST", match: "/api/auth/2fa/recovery-codes", label: "rigenerazione codici di recupero 2FA" },
    { method: "GET", match: /^\/api\/reports\/\d+\/print$/, label: "download ricevuta report" },
    { method: "GET", match: /^\/api\/interventions\/\d+\/print$/, label: "download ricevuta intervento" },
    { method: "GET", match: /^\/api\/settings\/backup\/download\/.+$/, label: "download backup" },
    { method: "GET", match: /^\/api\/settings\/logs\/\d{4}-\d{2}-\d{2}\/download$/, label: "download log azioni" },
    { method: "POST", match: "/api/settings/backup/key", label: "esportazione chiave di backup" },
    // Gli export CSV e i resoconti PDF sono GET, quindi restavano fuori dal registro come
    // qualunque altra consultazione — invisibili, non solo con l'etichetta generica. L'export
    // dei report porta con sé la colonna Password dei dispositivi (vedi BACKLOG), quindi è
    // proprio il tipo di scarico che vale la pena tracciare.
    { method: "GET", match: "/api/reports/export.csv", label: "esportazione CSV report" },
    { method: "GET", match: "/api/interventions/export.csv", label: "esportazione CSV interventi" },
    { method: "GET", match: "/api/customers/export.csv", label: "esportazione CSV clienti" },
    {
        method: "GET",
        match: /^\/api\/customers\/\d+\/reports\/print$/,
        label: "stampa resoconto report cliente",
    },
    {
        method: "GET",
        match: /^\/api\/customers\/\d+\/interventions\/print$/,
        label: "stampa resoconto interventi cliente",
    },
    {
        method: "GET",
        match: /^\/api\/collaborators\/\d+\/reports\/print$/,
        label: "stampa resoconto report collaboratore",
    },
    {
        method: "GET",
        match: /^\/api\/collaborators\/\d+\/interventions\/print$/,
        label: "stampa resoconto interventi collaboratore",
    },
    // Il ripristino sovrascrive l'intero database: è l'azione più delicata di tutta l'app, e
    // "creato /api/settings/backup/restore" (il verbo generico di una POST) è più che
    // fuorviante per quello che succede davvero — lo stesso motivo per cui login e logout
    // hanno un'etichetta a sé.
    { method: "POST", match: "/api/settings/backup/restore", label: "ripristino backup" },
    { method: "POST", match: "/api/settings/backup/restore/upload", label: "ripristino backup da file caricato" },
    // Un admin che guarda le sessioni (dispositivo, IP, ultima attività) di un altro utente:
    // è una GET, quindi fuori dal registro come ogni altra consultazione, ma è esattamente il
    // tipo di "chi ha guardato l'attività di chi" per cui il registro esiste.
    { method: "GET", match: /^\/api\/users\/\d+\/sessions$/, label: "consultazione sessioni di un utente" },
    // Un admin che toglie la 2FA a un altro utente, non a sé stesso (quel caso resta
    // "DELETE /api/auth/2fa", già etichettato sopra): abbassa la sicurezza di un account che
    // non è il suo, va distinto dal verbo generico "creato" di questa POST.
    { method: "POST", match: /^\/api\/users\/\d+\/disable-2fa$/, label: "disattivazione 2FA di un utente" },
];

const findActionLabel = (method: string, normalizedPath: string): string | null => {
    const rule = actionLabelRules.find(
        (candidate) =>
            candidate.method === method &&
            (typeof candidate.match === "string"
                ? candidate.match === normalizedPath
                : candidate.match.test(normalizedPath))
    );

    return rule?.label ?? null;
};

export const userActionLogger = (request: Request, _response: Response, next: NextFunction) => {
    if (!request.originalUrl.startsWith("/api") || request.originalUrl.startsWith("/api/health")) {
        next();
        return;
    }

    const normalizedPath = request.originalUrl.split("?")[0];
    const specificLabel = findActionLabel(request.method, normalizedPath);

    // Le GET si registrano solo quando hanno un'etichetta dedicata (i download sensibili
    // sopra): tutte le altre sono consultazioni, e tracciarle tutte sommergerebbe il log
    // con ogni apertura di lista o pagina di dettaglio.
    if (!trackedMethods.has(request.method) && !specificLabel) {
        next();
        return;
    }

    const response = _response;
    // Sanificato come `user` ed `error` qui sotto: oggi arriva solo da `CF-Connecting-IP`
    // (che Cloudflare sovrascrive sempre, vedi clientIp.ts) o dal socket TCP, quindi non
    // può contenere `|` o a-capo — ma se in futuro cambiasse la catena di proxy, questo
    // campo non deve restare l'unico dei quattro senza la stessa protezione.
    const rawIp = getClientIp(request);
    const ip = rawIp.replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "unknown";
    const action = specificLabel ?? formatAction(request.method, normalizedPath);
    response.once("finish", () => {
        const now = new Date();
        const timestamp = now.toISOString();
        const dayKey = getDayKey(now);
        const status = response.statusCode;
        const rawUsername = request.user?.username ?? "";
        const user = rawUsername.replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "-";
        const rawErrorMessage =
            typeof response.locals.apiErrorMessage === "string" ? response.locals.apiErrorMessage : "";
        const cleanErrorMessage = rawErrorMessage.replace(/\s+/g, " ").trim();
        const errorPart = status >= 400 ? ` | error=${cleanErrorMessage || `HTTP ${status}`}` : "";
        const logLine = `${timestamp} | ip=${ip} | user=${user} | action=${action} | status=${status}${errorPart}\n`;

        void appendUserActionLog(logLine, dayKey).catch((error) => {
            console.error("Impossibile scrivere il log azioni utente:", error);
        });
    });

    next();
};
