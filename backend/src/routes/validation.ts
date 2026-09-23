import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

// La localizzazione italiana di zod (`z.config(z.locales.it())`) è impostata una volta sola
// in app.ts, prima di qualunque rotta: qui sotto i messaggi di zod arrivano già in italiano.

type ValidationSchemas = {
    params?: ZodType;
    query?: ZodType;
    body?: ZodType;
};

type ValidationErrorResponse = {
    message: string;
    errors: {
        params?: unknown;
        query?: unknown;
        body?: unknown;
    };
};

const setValidatedRequestProperty = <T extends keyof Pick<Request, "params" | "query" | "body">>(
    req: Request,
    key: T,
    value: Request[T]
) => {
    Object.defineProperty(req, key, {
        value,
        configurable: true,
        enumerable: true,
        writable: true,
    });
};

const defaultValidationMessage = "Dati non validi";

export const validate = ({ params, query, body }: ValidationSchemas): RequestHandler => {
    return (req: Request, res: Response<ValidationErrorResponse>, next: NextFunction) => {
        const errors: ValidationErrorResponse["errors"] = {};
        // Il messaggio di primo piano che vede l'utente (vedi frontend/src/lib/api/errors.ts, che
        // legge solo `data.message` e ignora `errors`): il primo problema di zod trovato, nello
        // stesso ordine in cui si controllano le sezioni qui sotto.
        let firstMessage: string | null = null;

        if (params) {
            const parsedParams = params.safeParse(req.params);
            if (!parsedParams.success) {
                errors.params = parsedParams.error.flatten();
                firstMessage ??= parsedParams.error.issues[0]?.message ?? null;
            } else {
                setValidatedRequestProperty(req, "params", parsedParams.data as Request["params"]);
            }
        }

        if (query) {
            const parsedQuery = query.safeParse(req.query);
            if (!parsedQuery.success) {
                errors.query = parsedQuery.error.flatten();
                firstMessage ??= parsedQuery.error.issues[0]?.message ?? null;
            } else {
                setValidatedRequestProperty(req, "query", parsedQuery.data as Request["query"]);
            }
        }

        if (body) {
            const parsedBody = body.safeParse(req.body);
            if (!parsedBody.success) {
                errors.body = parsedBody.error.flatten();
                firstMessage ??= parsedBody.error.issues[0]?.message ?? null;
            } else {
                setValidatedRequestProperty(req, "body", parsedBody.data as Request["body"]);
            }
        }

        if (Object.keys(errors).length > 0) {
            res.status(400).json({
                message: firstMessage ?? defaultValidationMessage,
                errors,
            });
            return;
        }

        next();
    };
};
