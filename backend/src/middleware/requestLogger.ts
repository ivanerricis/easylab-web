import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Log a riga singola per ogni richiesta API, su stdout (quindi raccolto dal driver
 * json-file di Docker e visibile con `docker logs backend`).
 *
 * Complementare a `userActionLogger`, che è tutt'altra cosa: quello registra su file solo
 * le azioni che modificano dati, per audit, ed è consultabile dalla UI. Questo serve a
 * diagnosticare il server — copre anche le GET e riporta la durata, che è l'informazione
 * che mancava quando qualcosa risultava lento.
 *
 * Il formato `chiave=valore` è lo stesso di userActionLogger: resta leggibile a occhio in
 * `docker logs` e resta comunque estraibile con grep/awk.
 */

// L'healthcheck del container interroga /api/health di continuo, e ogni scheda aperta
// interroga /api/settings/update-state ogni pochi secondi per accorgersi di un aggiornamento
// in corso: registrarle riempirebbe i log senza dire nulla.
const ignoredPaths = ["/api/health", "/api/settings/update-state"];

const slowRequestThresholdMs = 1000;

/**
 * Sigla breve della richiesta, in `res.locals.requestId` e nell'header `X-Request-Id`. Compare
 * nella riga di questo log e davanti allo stack di un 500 (errorHandler): senza, con più
 * richieste insieme non si capisce a quale riga appartiene uno stack.
 */
export const readRequestId = (response: Response): string =>
    typeof response.locals.requestId === "string" ? response.locals.requestId : "-";

export const requestLogger = (request: Request, response: Response, next: NextFunction) => {
    const path = request.originalUrl.split("?")[0];

    if (!path.startsWith("/api") || ignoredPaths.includes(path)) {
        next();
        return;
    }

    const requestId = randomBytes(4).toString("hex");
    response.locals.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);

    const startedAt = process.hrtime.bigint();

    response.once("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const status = response.statusCode;
        const slowMark = durationMs >= slowRequestThresholdMs ? " | slow=true" : "";
        // Stessa sanificazione di userActionLogger: il separatore del formato è ` | `.
        const user = (request.user?.username ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "-";
        const message =
            typeof response.locals.apiErrorMessage === "string"
                ? response.locals.apiErrorMessage.replace(/\s+/g, " ").trim()
                : "";
        const errorPart = status >= 400 ? ` | error=${message || `HTTP ${status}`}` : "";
        const line =
            `${new Date().toISOString()} | req=${requestId} | method=${request.method} | path=${path} | ` +
            `user=${user} | status=${status} | duration=${durationMs.toFixed(1)}ms${slowMark}${errorPart}`;

        if (status >= 500) {
            console.error(line);
        } else {
            console.log(line);
        }
    });

    next();
};
