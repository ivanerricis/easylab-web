import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Il filtro per collaboratore sulle due rotte di lista.
 *
 * La scheda del collaboratore ci si appoggia per intero: senza, si portava in pagina le prime
 * `unpaginatedMaxRows` righe della tabella e le filtrava nel browser, mostrandone quindi solo
 * una parte e senza dirlo. Il rischio, se il parametro sparisse dallo schema di query, è
 * proprio quello: la validazione scarta i parametri sconosciuti, la lista risponde 200 e
 * torna i report di tutti.
 */
vi.mock("../db/queries/report", () => ({
    listReports: vi.fn(),
    getReportById: vi.fn(),
    createReport: vi.fn(),
    updateReportById: vi.fn(),
    deleteReportById: vi.fn(),
    getReportStats: vi.fn(),
}));

vi.mock("../db/queries/intervention", () => ({
    listInterventions: vi.fn(),
    getInterventionById: vi.fn(),
    createIntervention: vi.fn(),
    updateInterventionById: vi.fn(),
    deleteInterventionById: vi.fn(),
    getInterventionStats: vi.fn(),
}));

import { listReports } from "../db/queries/report";
import { listInterventions } from "../db/queries/intervention";
import reportsRouter from "./reports";
import interventionsRouter from "./interventions";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/reports", reportsRouter);
    app.use("/api/interventions", interventionsRouter);
    app.use(errorHandler);
    return app;
};

describe("filtro per collaboratore sulle liste", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("inoltra collaboratorId alla query dei report", async () => {
        vi.mocked(listReports).mockResolvedValue({ items: [], totalItems: 0 } as never);

        const response = await request(buildApp()).get("/api/reports?page=1&pageSize=10&collaboratorId=7");

        expect(response.status).toBe(200);
        expect(vi.mocked(listReports).mock.calls[0][0]).toMatchObject({ collaboratorId: 7 });
    });

    it("inoltra collaboratorId alla query degli interventi", async () => {
        vi.mocked(listInterventions).mockResolvedValue({ items: [], totalItems: 0 } as never);

        const response = await request(buildApp()).get("/api/interventions?page=1&pageSize=10&collaboratorId=7");

        expect(response.status).toBe(200);
        expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({ collaboratorId: 7 });
    });

    it("rifiuta un collaboratorId che non è un id", async () => {
        vi.mocked(listReports).mockResolvedValue({ items: [], totalItems: 0 } as never);

        const response = await request(buildApp()).get("/api/reports?page=1&pageSize=10&collaboratorId=0");

        expect(response.status).toBe(400);
        expect(listReports).not.toHaveBeenCalled();
    });

    it("senza collaboratorId la query non ne riceve uno", async () => {
        vi.mocked(listReports).mockResolvedValue({ items: [], totalItems: 0 } as never);

        await request(buildApp()).get("/api/reports?page=1&pageSize=10");

        expect(vi.mocked(listReports).mock.calls[0][0].collaboratorId).toBeUndefined();
    });
});
