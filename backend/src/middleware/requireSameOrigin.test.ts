import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRequireSameOrigin, parseAllowedOrigins } from "./requireSameOrigin";

const buildApp = (allowedOrigins: string[] = []) => {
    const app = express();
    app.use("/api", createRequireSameOrigin(allowedOrigins));
    app.all("/api/azione", (_req, res) => {
        res.json({ ok: true });
    });
    return app;
};

describe("requireSameOrigin", () => {
    it("lascia passare le letture da qualunque origine", async () => {
        const response = await request(buildApp())
            .get("/api/azione")
            .set("Sec-Fetch-Site", "cross-site")
            .set("Origin", "https://altro.example.it");

        expect(response.status).toBe(200);
    });

    it("lascia passare le scritture che il browser dichiara della stessa origine", async () => {
        const response = await request(buildApp())
            .post("/api/azione")
            .set("Sec-Fetch-Site", "same-origin")
            .set("Origin", "https://easylab.example.it");

        expect(response.status).toBe(200);
    });

    /**
     * Il caso per cui il middleware esiste: un sottodominio vicino è lo stesso *sito*, quindi il
     * cookie `SameSite=Lax` gli viene spedito, ma non è la stessa *origine*.
     */
    it.each(["same-site", "cross-site", "none"])("rifiuta le scritture con Sec-Fetch-Site %s", async (site) => {
        const response = await request(buildApp())
            .post("/api/azione")
            .set("Sec-Fetch-Site", site)
            .set("Origin", "https://altro.example.it");

        expect(response.status).toBe(403);
        expect(response.body.message).toMatch(/rifiutata/);
    });

    it("rifiuta anche DELETE e PUT, non solo POST", async () => {
        const app = buildApp();

        expect((await request(app).delete("/api/azione").set("Sec-Fetch-Site", "same-site")).status).toBe(403);
        expect((await request(app).put("/api/azione").set("Sec-Fetch-Site", "cross-site")).status).toBe(403);
    });

    it("lascia passare le origini di CORS_ORIGIN, per il frontend di sviluppo su un'altra porta", async () => {
        const response = await request(buildApp(["http://localhost:5173"]))
            .post("/api/azione")
            .set("Sec-Fetch-Site", "same-site")
            .set("Origin", "http://localhost:5173");

        expect(response.status).toBe(200);
    });

    it("senza Sec-Fetch-Site (browser vecchi) confronta l'host di Origin con quello della richiesta", async () => {
        const app = buildApp();

        const sameHost = await request(app)
            .post("/api/azione")
            .set("Host", "easylab.example.it")
            .set("Origin", "https://easylab.example.it");
        const otherHost = await request(app)
            .post("/api/azione")
            .set("Host", "easylab.example.it")
            .set("Origin", "https://altro.example.it");
        const malformed = await request(app)
            .post("/api/azione")
            .set("Host", "easylab.example.it")
            .set("Origin", "null");

        expect(sameHost.status).toBe(200);
        expect(otherHost.status).toBe(403);
        expect(malformed.status).toBe(403);
    });

    it("lascia passare le richieste senza nessuno dei due header, che non vengono da un browser", async () => {
        const response = await request(buildApp()).post("/api/azione");

        expect(response.status).toBe(200);
    });
});

describe("parseAllowedOrigins", () => {
    it("separa, ripulisce e scarta le voci vuote", () => {
        expect(parseAllowedOrigins(" http://localhost:5173 , ,http://127.0.0.1:5173")).toEqual([
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]);
    });

    it("senza variabile non apre nessuna origine", () => {
        expect(parseAllowedOrigins(undefined)).toEqual([]);
    });
});
