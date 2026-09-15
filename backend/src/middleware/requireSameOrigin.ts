import type { NextFunction, Request, Response } from "express";

/**
 * Le origin a cui il CORS è aperto, da `CORS_ORIGIN` (separate da virgole). In produzione la
 * variabile non c'è: frontend e backend stanno sulla stessa origin dietro nginx. In sviluppo
 * elenca Vite (http://localhost:5173), che chiama il backend su un'altra porta.
 */
export const parseAllowedOrigins = (value = process.env.CORS_ORIGIN): string[] =>
    value
        ?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [];

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

const hostnameOf = (value: string): string | null => {
    try {
        return new URL(value.includes("://") ? value : `http://${value}`).hostname;
    } catch {
        return null;
    }
};

/**
 * Rifiuta le richieste di scrittura partite da un'altra origin.
 *
 * `SameSite=Lax` sul cookie di sessione non basta: protegge dai siti *diversi*, ma per il
 * browser un sottodominio vicino (`altro.iltuodominio.it` accanto a `easylab.iltuodominio.it`)
 * è lo stesso sito, e il cookie gli viene spedito. L'app vive proprio così, su un sottodominio
 * accanto ad altri servizi (docs/DEPLOY.md): una pagina compromessa su uno di quelli, aperta
 * dall'admin mentre è loggato, poteva mandare POST `multipart` senza preflight — fra cui il
 * ripristino di un dump scelto da lei.
 *
 * Il criterio è `Sec-Fetch-Site`, che il browser scrive da sé e una pagina non può falsificare:
 * passa solo `same-origin`. Chi non lo manda (browser vecchi) viene giudicato da `Origin`, che
 * deve avere lo stesso host della richiesta. Le origin di `CORS_ORIGIN` passano sempre: servono
 * al frontend di sviluppo, che sta su un'altra porta. Una richiesta senza nessuno dei due header
 * non viene da un browser (curl, script di manutenzione) e non porta cookie altrui: passa.
 */
export const createRequireSameOrigin = (allowedOrigins: string[]) => {
    const allowed = new Set(allowedOrigins);

    return (req: Request, res: Response, next: NextFunction) => {
        if (safeMethods.has(req.method)) {
            next();
            return;
        }

        const fetchSite = req.get("sec-fetch-site");
        const origin = req.get("origin");

        if (origin && allowed.has(origin)) {
            next();
            return;
        }

        if (fetchSite) {
            if (fetchSite === "same-origin") {
                next();
                return;
            }
        } else if (!origin) {
            next();
            return;
        } else {
            const host = req.get("host");
            const originHostname = hostnameOf(origin);

            if (host && originHostname && originHostname === hostnameOf(host)) {
                next();
                return;
            }
        }

        const message = "Richiesta rifiutata: arriva da una pagina che non è questa applicazione.";
        res.locals.apiErrorMessage = message;
        res.status(403).json({ message });
    };
};

export const requireSameOrigin = createRequireSameOrigin(parseAllowedOrigins());
