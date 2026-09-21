import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { errorHandler } from "./errorHandler";
import { ApiError } from "../services/apiError";

const createResponse = () => {
    const res = {
        locals: {} as Record<string, unknown>,
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
    };

    return res as unknown as Response & { statusCode: number; body: { message: string } };
};

const run = (error: unknown) => {
    const res = createResponse();
    errorHandler(error, {} as Request, res, (() => {}) as NextFunction);
    return res;
};

describe("errorHandler", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("risponde a un ApiError con il suo messaggio e il suo status", () => {
        const res = run(new ApiError("Il file di dump non esiste più", 404));

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe("Il file di dump non esiste più");
        expect(res.locals.apiErrorMessage).toBe("Il file di dump non esiste più");
    });

    it("riconosce anche le sottoclassi di ApiError sollevate dai servizi", () => {
        class BackupManagerError extends ApiError {}
        const res = run(new BackupManagerError("È già in corso un'operazione sul database", 409));

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toBe("È già in corso un'operazione sul database");
    });

    // Multer segnala il superamento del limite con un `code` testuale, che senza un ramo
    // dedicato finirebbe nel caso generico: un upload troppo grande risponderebbe "errore
    // imprevisto" con status 500, senza dire cosa è andato storto.
    it("traduce il limite di dimensione di multer in 413", () => {
        const error = Object.assign(new Error("File too large"), { code: "LIMIT_FILE_SIZE" });
        const res = run(error);

        expect(res.statusCode).toBe(413);
        expect(res.body.message).toMatch(/dimensione massima/i);
    });

    it("mappa la violazione di unicità (23505) su 409 con un messaggio per il vincolo, non il dettaglio Postgres", () => {
        const res = run({
            code: "23505",
            constraint: "user_username_unique",
            detail: "Key (username)=(mario) already exists.",
        });

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toBe("Esiste già un utente con questo nome.");
        // Il dettaglio resta per il registro delle azioni, lato server.
        expect(res.locals.apiErrorMessage).toBe("Key (username)=(mario) already exists.");
    });

    it("per un vincolo di unicità non censito risponde con un messaggio generico", () => {
        const res = run({
            code: "23505",
            constraint: "altro_unique",
            detail: "Key (colonna)=(valore) already exists.",
        });

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toBe("Esiste già un elemento con questi dati.");
        expect(res.body.message).not.toContain("colonna");
    });

    it("per una FK non censita non restituisce il dettaglio Postgres", () => {
        const res = run({
            code: "23503",
            constraint: "altro_fk",
            detail: 'Key (x_id)=(9) is not present in table "x".',
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Riferimento non valido");
    });

    it("traduce una FK violata in cancellazione nel messaggio sul genitore", () => {
        const res = run({
            code: "23503",
            constraint: "report_device_id_device_id_fk",
            message: 'update or delete on table "device" violates foreign key constraint',
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Impossibile eliminare il dispositivo: è ancora associato a uno o più report.");
    });

    it("traduce una FK violata in inserimento nel messaggio sul riferimento", () => {
        const res = run({
            code: "23503",
            constraint: "report_device_id_device_id_fk",
            message: 'insert or update on table "report" violates foreign key constraint',
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Il dispositivo selezionato non esiste.");
    });

    it("mappa un CHECK di riga (23514) sul report su 400 col messaggio per il vincolo", () => {
        const res = run({
            code: "23514",
            constraint: "report_paid_price_check",
            message: 'new row for relation "report" violates check constraint "report_paid_price_check"',
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0");
    });

    it("mappa l'altro CHECK del report (chiuso ⇒ collaboratore) sul suo messaggio", () => {
        const res = run({
            code: "23514",
            constraint: "report_closed_collaborator_check",
            message: 'new row for relation "report" violates check constraint "report_closed_collaborator_check"',
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Per chiudere un report è necessario indicare un collaboratore");
    });

    it("per un CHECK non censito risponde con un messaggio generico, senza il dettaglio Postgres", () => {
        const res = run({
            code: "23514",
            constraint: "altro_check",
            detail: "Failing row contains (...).",
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("I dati inseriti non sono validi.");
        expect(res.locals.apiErrorMessage).toBe("Failing row contains (...).");
    });

    it("trova l'errore Postgres anche annidato dentro `cause`", () => {
        const res = run(new Error("wrapper", { cause: { code: "23502", detail: "Colonna mancante" } }));

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Campo obbligatorio mancante");
        expect(res.locals.apiErrorMessage).toBe("Colonna mancante");
    });

    it("non espone il dettaglio Postgres al client sugli errori non gestiti", () => {
        const res = run({ message: 'relation "report" does not exist', detail: "interno" });

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toBe("Si è verificato un errore imprevisto. Riprova più tardi.");
        expect(res.body.message).not.toContain("report");
        // Il dettaglio deve comunque restare disponibile per il log azioni utente.
        expect(res.locals.apiErrorMessage).toBe("interno");
    });
});
