import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Stesso schema di devices.test.ts: query layer mockato, si copre routing/validazione/forma.
vi.mock("../db/queries/collaborator", () => ({
    listCollaborators: vi.fn(),
    getCollaboratorById: vi.fn(),
    createCollaborator: vi.fn(),
    updateCollaboratorById: vi.fn(),
    deleteCollaboratorById: vi.fn(),
}));

import {
    createCollaborator,
    deleteCollaboratorById,
    getCollaboratorById,
    updateCollaboratorById,
} from "../db/queries/collaborator";
import collaboratorsRouter from "./collaborators";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/collaborators", collaboratorsRouter);
    app.use(errorHandler);
    return app;
};

const collaborator = { id: 1, firstName: "Mario", lastName: "Rossi", phoneNumber: null };

describe("collaborators router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("risponde 404 quando il collaboratore non esiste", async () => {
        vi.mocked(getCollaboratorById).mockResolvedValue([] as never);

        const response = await request(buildApp()).get("/api/collaborators/999");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Collaborator not found");
    });

    it("crea un collaboratore e risponde 201", async () => {
        vi.mocked(createCollaborator).mockResolvedValue([collaborator] as never);

        const response = await request(buildApp()).post("/api/collaborators").send({ firstName: "Mario" });

        expect(response.status).toBe(201);
        expect(createCollaborator).toHaveBeenCalledWith({ firstName: "Mario" });
    });

    it("rifiuta la creazione con nome vuoto", async () => {
        const response = await request(buildApp()).post("/api/collaborators").send({ firstName: "   " });

        expect(response.status).toBe(400);
        expect(createCollaborator).not.toHaveBeenCalled();
    });

    it("rifiuta un campo non previsto dallo schema", async () => {
        const response = await request(buildApp())
            .post("/api/collaborators")
            .send({ firstName: "Mario", ruolo: "tecnico" });

        expect(response.status).toBe(400);
        expect(createCollaborator).not.toHaveBeenCalled();
    });

    it("rifiuta un update senza campi", async () => {
        const response = await request(buildApp()).put("/api/collaborators/1").send({});

        expect(response.status).toBe(400);
        expect(updateCollaboratorById).not.toHaveBeenCalled();
    });

    it("aggiorna un collaboratore esistente", async () => {
        vi.mocked(updateCollaboratorById).mockResolvedValue([collaborator] as never);

        const response = await request(buildApp()).put("/api/collaborators/1").send({ lastName: "Bianchi" });

        expect(response.status).toBe(200);
        expect(updateCollaboratorById).toHaveBeenCalledWith(1, { lastName: "Bianchi" });
    });

    it("elimina un collaboratore esistente", async () => {
        vi.mocked(deleteCollaboratorById).mockResolvedValue([collaborator] as never);

        const response = await request(buildApp()).delete("/api/collaborators/1");

        expect(response.status).toBe(200);
        expect(deleteCollaboratorById).toHaveBeenCalledWith(1);
    });

    it("risponde 404 sulla cancellazione di un id inesistente", async () => {
        vi.mocked(deleteCollaboratorById).mockResolvedValue([] as never);

        const response = await request(buildApp()).delete("/api/collaborators/999");

        expect(response.status).toBe(404);
    });
});
