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
    { method: "GET", match: "/api/settings/backup/key", label: "esportazione chiave di backup" },
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
    const ip = getClientIp(request);
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
