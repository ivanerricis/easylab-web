import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Come negli altri test di rotta: il query layer è mockato, così la CI non ha bisogno di
// un Postgres. Qui interessa una cosa sola — che la voce generica del catalogo non possa
// sparire né sdoppiarsi — e quella vive nelle rotte, non nelle query.
vi.mock("../db/queries/issue", () => ({
    listIssues: vi.fn(),
    getIssueById: vi.fn(),
    createIssue: vi.fn(),
    updateIssueById: vi.fn(),
    deleteIssueById: vi.fn(),
}));

import { createIssue, deleteIssueById, getIssueById, updateIssueById } from "../db/queries/issue";
import issuesRouter from "./issues";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/issues", issuesRouter);
    app.use(errorHandler);
    return app;
};

const catchAll = { id: 1, description: "Altro", created_at: new Date(), updated_at: null };
const normale = { id: 2, description: "Batteria non carica", created_at: new Date(), updated_at: null };

describe("protezione della voce generica del catalogo difetti", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * È il caso che conta: senza "Altro" nel catalogo, il dialogo del report non mostra più
     * la casella con cui si descrive il problema — e non comparirebbe nessun errore, il
     * programma continuerebbe a funzionare stampando ricevute meno utili.
     */
    it('rifiuta di eliminare "Altro" e non arriva alla query di cancellazione', async () => {
        vi.mocked(getIssueById).mockResolvedValue([catchAll] as never);

        const response = await request(buildApp()).delete("/api/issues/1");

        expect(response.status).toBe(409);
        expect(response.body.message).toMatch(/non si può eliminare né rinominare/i);
        expect(deleteIssueById).not.toHaveBeenCalled();
    });

    it("lascia eliminare un difetto qualunque", async () => {
        vi.mocked(getIssueById).mockResolvedValue([normale] as never);
        vi.mocked(deleteIssueById).mockResolvedValue([normale] as never);

        const response = await request(buildApp()).delete("/api/issues/2");

        expect(response.status).toBe(200);
        expect(deleteIssueById).toHaveBeenCalledWith(2);
    });

    it('rifiuta di rinominare "Altro" in qualcos\'altro', async () => {
        vi.mocked(getIssueById).mockResolvedValue([catchAll] as never);

        const response = await request(buildApp()).put("/api/issues/1").send({ description: "Generico" });

        expect(response.status).toBe(409);
        expect(updateIssueById).not.toHaveBeenCalled();
    });

    /**
     * Il vincolo di unicità di Postgres distingue le maiuscole, quindi da solo lascerebbe
     * convivere "Altro" e "altro": nel dialogo del report sembrerebbero entrambe la voce
     * generica, e quale delle due vinca dipenderebbe dall'ordine della lista.
     */
    it('rifiuta di creare un secondo "altro", anche scritto diversamente', async () => {
        for (const description of ["Altro", "altro", "ALTRO", "  Altro  "]) {
            vi.clearAllMocks();

            const response = await request(buildApp()).post("/api/issues").send({ description });

            expect(response.status, description).toBe(409);
            expect(createIssue, description).not.toHaveBeenCalled();
        }
    });

    it('rifiuta di rinominare un difetto qualunque in "Altro"', async () => {
        vi.mocked(getIssueById).mockResolvedValue([normale] as never);

        const response = await request(buildApp()).put("/api/issues/2").send({ description: "altro" });

        expect(response.status).toBe(409);
        expect(updateIssueById).not.toHaveBeenCalled();
    });

    it("lascia creare e rinominare i difetti normali", async () => {
        vi.mocked(createIssue).mockResolvedValue([normale] as never);
        vi.mocked(getIssueById).mockResolvedValue([normale] as never);
        vi.mocked(updateIssueById).mockResolvedValue([normale] as never);

        const creazione = await request(buildApp()).post("/api/issues").send({ description: "Schermo rotto" });
        expect(creazione.status).toBe(201);

        const modifica = await request(buildApp()).put("/api/issues/2").send({ description: "Schermo crepato" });
        expect(modifica.status).toBe(200);
        expect(updateIssueById).toHaveBeenCalledWith(2, { description: "Schermo crepato" });
    });

    /**
     * La guardia sta prima della validazione del factory: non deve mangiarsi i 400 che
     * spettano a un corpo malformato, altrimenti un errore di battitura del client
     * diventerebbe un 409 incomprensibile.
     */
    it("lascia passare alla validazione un corpo senza descrizione", async () => {
        const response = await request(buildApp()).post("/api/issues").send({ nome: "sbagliato" });

        expect(response.status).toBe(400);
        expect(createIssue).not.toHaveBeenCalled();
    });
});
