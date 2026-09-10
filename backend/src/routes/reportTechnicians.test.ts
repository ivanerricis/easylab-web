import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Come negli altri test di rotta: il query layer è mockato, niente Postgres in CI.
vi.mock("../db/queries/reportTechnician", () => ({
    listReportTechnicians: vi.fn(),
    getReportTechnicianByIds: vi.fn(),
    createReportTechnician: vi.fn(),
    updateReportTechnicianByIds: vi.fn(),
    deleteReportTechnicianByIds: vi.fn(),
}));

import {
    createReportTechnician,
    deleteReportTechnicianByIds,
    getReportTechnicianByIds,
    listReportTechnicians,
    updateReportTechnicianByIds,
} from "../db/queries/reportTechnician";
import reportTechniciansRouter from "./reportTechnicians";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/report-technicians", reportTechniciansRouter);
    app.use(errorHandler);
    return app;
};

const reportTechnician = { reportId: 1, technicianId: 2, price: 5000 };

describe("reportTechnicians router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("restituisce la lista, senza paginazione", async () => {
        vi.mocked(listReportTechnicians).mockResolvedValue([reportTechnician] as never);

        const response = await request(buildApp()).get("/api/report-technicians");

        expect(response.status).toBe(200);
        expect(response.body).toEqual([reportTechnician]);
    });

    it("risponde 404 quando l'associazione non esiste", async () => {
        vi.mocked(getReportTechnicianByIds).mockResolvedValue([] as never);

        const response = await request(buildApp()).get("/api/report-technicians/1/2");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Report technician not found");
    });

    it("recupera un'associazione esistente per coppia di id", async () => {
        vi.mocked(getReportTechnicianByIds).mockResolvedValue([reportTechnician] as never);

        const response = await request(buildApp()).get("/api/report-technicians/1/2");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(reportTechnician);
        expect(getReportTechnicianByIds).toHaveBeenCalledWith(1, 2);
    });

    it("crea un'associazione e risponde 201", async () => {
        vi.mocked(createReportTechnician).mockResolvedValue([reportTechnician] as never);

        const response = await request(buildApp())
            .post("/api/report-technicians")
            .send({ reportId: 1, technicianId: 2, price: 5000 });

        expect(response.status).toBe(201);
        expect(createReportTechnician).toHaveBeenCalledWith({ reportId: 1, technicianId: 2, price: 5000 });
    });

    it("crea un'associazione senza price, che resta opzionale", async () => {
        vi.mocked(createReportTechnician).mockResolvedValue([{ ...reportTechnician, price: 0 }] as never);

        const response = await request(buildApp()).post("/api/report-technicians").send({ reportId: 1, technicianId: 2 });

        expect(response.status).toBe(201);
        expect(createReportTechnician).toHaveBeenCalledWith({ reportId: 1, technicianId: 2 });
    });

    it("rifiuta la creazione senza reportId né technicianId", async () => {
        const response = await request(buildApp()).post("/api/report-technicians").send({ price: 100 });

        expect(response.status).toBe(400);
        expect(createReportTechnician).not.toHaveBeenCalled();
    });

    it("rifiuta un price negativo in creazione", async () => {
        const response = await request(buildApp())
            .post("/api/report-technicians")
            .send({ reportId: 1, technicianId: 2, price: -1 });

        expect(response.status).toBe(400);
        expect(createReportTechnician).not.toHaveBeenCalled();
    });

    it("rifiuta la creazione con un campo sconosciuto", async () => {
        const response = await request(buildApp())
            .post("/api/report-technicians")
            .send({ reportId: 1, technicianId: 2, note: "extra" });

        expect(response.status).toBe(400);
        expect(createReportTechnician).not.toHaveBeenCalled();
    });

    it("aggiorna il compenso di un'associazione esistente", async () => {
        vi.mocked(updateReportTechnicianByIds).mockResolvedValue([{ ...reportTechnician, price: 7500 }] as never);

        const response = await request(buildApp()).put("/api/report-technicians/1/2").send({ price: 7500 });

        expect(response.status).toBe(200);
        expect(updateReportTechnicianByIds).toHaveBeenCalledWith(1, 2, { price: 7500 });
    });

    // A differenza del cliente/dispositivo, qui il prezzo non è opzionale sull'update: è
    // l'unico campo della rotta, quindi ometterlo non ha un body sensato da accettare.
    it("rifiuta un update senza price", async () => {
        const response = await request(buildApp()).put("/api/report-technicians/1/2").send({});

        expect(response.status).toBe(400);
        expect(updateReportTechnicianByIds).not.toHaveBeenCalled();
    });

    it("risponde 404 sull'update di una coppia inesistente", async () => {
        vi.mocked(updateReportTechnicianByIds).mockResolvedValue([] as never);

        const response = await request(buildApp()).put("/api/report-technicians/1/2").send({ price: 7500 });

        expect(response.status).toBe(404);
    });

    it("elimina un'associazione esistente", async () => {
        vi.mocked(deleteReportTechnicianByIds).mockResolvedValue([reportTechnician] as never);

        const response = await request(buildApp()).delete("/api/report-technicians/1/2");

        expect(response.status).toBe(200);
        expect(deleteReportTechnicianByIds).toHaveBeenCalledWith(1, 2);
    });

    it("risponde 404 sulla cancellazione di una coppia inesistente", async () => {
        vi.mocked(deleteReportTechnicianByIds).mockResolvedValue([] as never);

        const response = await request(buildApp()).delete("/api/report-technicians/1/2");

        expect(response.status).toBe(404);
    });

    it("rifiuta id non positivi nei parametri", async () => {
        const response = await request(buildApp()).get("/api/report-technicians/0/2");

        expect(response.status).toBe(400);
        expect(getReportTechnicianByIds).not.toHaveBeenCalled();
    });
});
