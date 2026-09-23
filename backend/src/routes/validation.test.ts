import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate } from "./validation";

const buildApp = () => {
    const app = express();
    app.use(express.json());

    app.get(
        "/items/:id",
        validate({
            params: z.object({ id: z.coerce.number().int().positive() }),
            query: z.object({ page: z.coerce.number().int().min(1).optional() }),
        }),
        (req, res) => {
            res.json({ params: req.params, query: req.query });
        }
    );

    app.post("/items", validate({ body: z.object({ name: z.string().trim().min(1) }).strict() }), (req, res) => {
        res.status(201).json(req.body);
    });

    app.post(
        "/customers",
        validate({
            body: z
                .object({ phone: z.string().nullable().optional() })
                .refine((value) => value.phone != null, { message: "È necessario specificare almeno un campo" }),
        }),
        (req, res) => {
            res.status(201).json(req.body);
        }
    );

    return app;
};

describe("validate", () => {
    it("sostituisce params/query con i valori già convertiti di tipo", async () => {
        const response = await request(buildApp()).get("/items/42?page=3");

        expect(response.status).toBe(200);
        // Non "42"/"3": la coercizione zod deve arrivare all'handler.
        expect(response.body).toEqual({ params: { id: 42 }, query: { page: 3 } });
    });

    it("risponde 400 elencando la sezione non valida, con il primo messaggio di zod in italiano", async () => {
        const response = await request(buildApp()).get("/items/-1");

        expect(response.status).toBe(400);
        // Il testo esatto arriva dalla localizzazione italiana di zod (z.locales.it()), impostata
        // da questo modulo: qui basta verificare che non sia più il generico "Validation error"
        // (mai mostrato all'utente, vedi frontend/src/lib/api/errors.ts) e che sia lo stesso
        // messaggio che zod produce per lo schema dei parametri.
        const expectedMessage = z.object({ id: z.coerce.number().int().positive() }).safeParse({ id: -1 }).error!
            .issues[0].message;
        expect(response.body.message).toBe(expectedMessage);
        expect(response.body.errors).toHaveProperty("params");
        expect(response.body.errors).not.toHaveProperty("query");
    });

    it("applica il trim del body prima dell'handler", async () => {
        const response = await request(buildApp()).post("/items").send({ name: "  ciao  " });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ name: "ciao" });
    });

    it("rifiuta le proprietà non previste su uno schema strict", async () => {
        const response = await request(buildApp()).post("/items").send({ name: "ok", extra: true });

        expect(response.status).toBe(400);
        expect(response.body.errors).toHaveProperty("body");
    });

    it("usa il messaggio custom di un refine così com'è, senza passare dalla localizzazione", async () => {
        const response = await request(buildApp()).post("/customers").send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("È necessario specificare almeno un campo");
    });
});
