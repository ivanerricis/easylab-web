import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../db/queries/technician", () => ({
    listTechnicians: vi.fn(),
    getTechnicianById: vi.fn(),
    createTechnician: vi.fn(),
    updateTechnicianById: vi.fn(),
    deleteTechnicianById: vi.fn(),
}));

import {
    createTechnician,
    deleteTechnicianById,
    getTechnicianById,
    updateTechnicianById,
} from "../db/queries/technician";
import techniciansRouter from "./technicians";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/technicians", techniciansRouter);
    app.use(errorHandler);
    return app;
};

const technician = { id: 1, firstName: "Luca", lastName: "Verdi", phoneNumber: null, vatNumber: null };

describe("technicians router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("risponde 404 quando il tecnico non esiste", async () => {
        vi.mocked(getTechnicianById).mockResolvedValue([] as never);

        const response = await request(buildApp()).get("/api/technicians/999");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Technician not found");
    });

    it("crea un tecnico e risponde 201", async () => {
        vi.mocked(createTechnician).mockResolvedValue([technician] as never);

        const response = await request(buildApp()).post("/api/technicians").send({ firstName: "Luca" });

        expect(response.status).toBe(201);
        expect(createTechnician).toHaveBeenCalledWith({ firstName: "Luca" });
    });

    it("rifiuta la creazione con nome vuoto", async () => {
        const response = await request(buildApp()).post("/api/technicians").send({ firstName: "" });

        expect(response.status).toBe(400);
        expect(createTechnician).not.toHaveBeenCalled();
    });

    it("rifiuta un update senza campi", async () => {
        const response = await request(buildApp()).put("/api/technicians/1").send({});

        expect(response.status).toBe(400);
        expect(updateTechnicianById).not.toHaveBeenCalled();
    });

    it("aggiorna la partita IVA di un tecnico esistente", async () => {
        vi.mocked(updateTechnicianById).mockResolvedValue([technician] as never);

        const response = await request(buildApp()).put("/api/technicians/1").send({ vatNumber: "IT12345678901" });

        expect(response.status).toBe(200);
        expect(updateTechnicianById).toHaveBeenCalledWith(1, { vatNumber: "IT12345678901" });
    });

    it("elimina un tecnico esistente", async () => {
        vi.mocked(deleteTechnicianById).mockResolvedValue([technician] as never);

        const response = await request(buildApp()).delete("/api/technicians/1");

        expect(response.status).toBe(200);
        expect(deleteTechnicianById).toHaveBeenCalledWith(1);
    });

    it("risponde 404 sulla cancellazione di un id inesistente", async () => {
        vi.mocked(deleteTechnicianById).mockResolvedValue([] as never);

        const response = await request(buildApp()).delete("/api/technicians/999");

        expect(response.status).toBe(404);
    });
});
