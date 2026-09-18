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
    // Il doppione non lo ferma più la rotta ma l'indice unico su lower(description) (migration
    // 0031): qui si verifica che la rotta lasci passare la richiesta e traduca l'errore di
    // Postgres. Che l'indice rifiuti davvero "altro" accanto ad "Altro" lo prova issue.db.test.ts.
    const uniqueViolation = () =>
        Object.assign(new Error("duplicate key value violates unique constraint"), {
            code: "23505",
            constraint: "issue_description_lower_idx",
        });

    it('un secondo "altro" arriva al database, che lo rifiuta con 409', async () => {
        vi.mocked(createIssue).mockRejectedValue(uniqueViolation());

        const response = await request(buildApp()).post("/api/issues").send({ description: "altro" });

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Esiste già un guasto con questa descrizione.");
    });

    it('rinominare un difetto qualunque in "Altro" arriva al database, che lo rifiuta con 409', async () => {
        vi.mocked(getIssueById).mockResolvedValue([normale] as never);
        vi.mocked(updateIssueById).mockRejectedValue(uniqueViolation());

        const response = await request(buildApp()).put("/api/issues/2").send({ description: "altro" });

        expect(response.status).toBe(409);
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
