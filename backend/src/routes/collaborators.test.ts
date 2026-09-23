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

// La stampa dei resoconti: query, PDF e config mockati come in customers.test.ts.
vi.mock("../db/queries/report", () => ({
    listReports: vi.fn(),
}));

vi.mock("../db/queries/intervention", () => ({
    listInterventions: vi.fn(),
}));

vi.mock("../services/reportPdf", () => ({
    createCustomerReportsPdfBuffer: vi.fn(),
}));

vi.mock("../services/interventionPdf", () => ({
    createCustomerInterventionsPdfBuffer: vi.fn(),
}));

vi.mock("../config/lab", () => ({
    getLabConfig: vi.fn(),
    getAppTimeZone: vi.fn(async () => "Europe/Rome"),
}));

import {
    createCollaborator,
    deleteCollaboratorById,
    getCollaboratorById,
    updateCollaboratorById,
} from "../db/queries/collaborator";
import { listReports } from "../db/queries/report";
import { listInterventions } from "../db/queries/intervention";
import { createCustomerReportsPdfBuffer } from "../services/reportPdf";
import { createCustomerInterventionsPdfBuffer } from "../services/interventionPdf";
import { getLabConfig } from "../config/lab";
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
        expect(response.body.message).toBe("Collaboratore non trovato");
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

    describe("stampa PDF del collaboratore", () => {
        beforeEach(() => {
            vi.mocked(getLabConfig).mockResolvedValue({
                labName: "Laboratorio",
                labEmail: "info@lab.it",
                labAddress: "Via Roma 1",
                labPhone: "0212345678",
                timeZone: "Europe/Rome",
            } as never);
        });

        it("risponde 404 quando il collaboratore non esiste", async () => {
            vi.mocked(getCollaboratorById).mockResolvedValue([] as never);

            const reports = await request(buildApp()).get("/api/collaborators/999/reports/print");
            const interventions = await request(buildApp()).get("/api/collaborators/999/interventions/print");

            expect(reports.status).toBe(404);
            expect(interventions.status).toBe(404);
            expect(listReports).not.toHaveBeenCalled();
            expect(listInterventions).not.toHaveBeenCalled();
        });

        it("rifiuta un intervallo di date mal formattato", async () => {
            const response = await request(buildApp()).get("/api/collaborators/1/reports/print?dateTo=31-01-2026");

            expect(response.status).toBe(400);
            expect(getCollaboratorById).not.toHaveBeenCalled();
        });

        it("stampa i report del collaboratore, con il cliente di ogni riga e senza email", async () => {
            vi.mocked(getCollaboratorById).mockResolvedValue([{ ...collaborator, phoneNumber: "3331234567" }] as never);
            vi.mocked(listReports).mockResolvedValue({
                items: [
                    {
                        id: 42,
                        createdAt: new Date("2026-01-15"),
                        customer: "Anna Bianchi",
                        device: "iPhone 12",
                        issue: "Schermo rotto",
                        // Come la calcola ormai `listReports` (`issueTextExpr`): qui non c'è una
                        // descrizione scritta a mano, quindi coincide con l'etichetta.
                        issueText: "Schermo rotto",
                        closed: false,
                        alerted: false,
                        paymentMethod: "card",
                        totalPrice: 5000,
                    },
                ],
                totalItems: 1,
            } as never);
            vi.mocked(createCustomerReportsPdfBuffer).mockResolvedValue(Buffer.from("pdf") as never);

            const response = await request(buildApp()).get(
                "/api/collaborators/1/reports/print?dateFrom=2026-01-01&dateTo=2026-01-31"
            );

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("application/pdf");
            expect(response.headers["content-disposition"]).toContain("collaborator-1-reports.pdf");
            expect(listReports).toHaveBeenCalledWith({
                collaboratorId: 1,
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                timeZone: "Europe/Rome",
                unpaginatedLimit: expect.objectContaining({ maxRows: 2000, onOverflow: "reject" }),
            });
            const [data] = vi.mocked(createCustomerReportsPdfBuffer).mock.calls[0];
            expect(data).toMatchObject({
                customerId: 1,
                customerName: "Mario Rossi",
                subjectLabel: "Collaboratore",
                showCustomerColumn: true,
                reportCount: 1,
                reports: [
                    {
                        id: 42,
                        customerName: "Anna Bianchi",
                        deviceName: "iPhone 12",
                        issueDescription: "Schermo rotto",
                        totalPrice: 5000,
                    },
                ],
            });
            expect(data).not.toHaveProperty("customerEmail");
        });

        it("stampa gli interventi del collaboratore con il cliente di ogni riga", async () => {
            vi.mocked(getCollaboratorById).mockResolvedValue([collaborator] as never);
            vi.mocked(listInterventions).mockResolvedValue([
                {
                    id: 7,
                    createdAt: new Date("2026-02-01"),
                    customer: "Anna Bianchi",
                    type: "intervento_remoto",
                    status: "programmato",
                    description: null,
                    interventionDate: null,
                    startTime: null,
                    endTime: null,
                },
            ] as never);
            vi.mocked(createCustomerInterventionsPdfBuffer).mockResolvedValue(Buffer.from("pdf") as never);

            const response = await request(buildApp()).get("/api/collaborators/1/interventions/print");

            expect(response.status).toBe(200);
            expect(response.headers["content-disposition"]).toContain("collaborator-1-interventions.pdf");
            expect(listInterventions).toHaveBeenCalledWith({
                collaboratorId: 1,
                dateFrom: undefined,
                dateTo: undefined,
                timeZone: "Europe/Rome",
                unpaginatedLimit: expect.objectContaining({ maxRows: 2000, onOverflow: "reject" }),
            });
            expect(createCustomerInterventionsPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    subjectLabel: "Collaboratore",
                    showCustomerColumn: true,
                    interventionCount: 1,
                    interventions: [
                        expect.objectContaining({ id: 7, customerName: "Anna Bianchi", type: "intervento_remoto" }),
                    ],
                })
            );
        });
    });
});
