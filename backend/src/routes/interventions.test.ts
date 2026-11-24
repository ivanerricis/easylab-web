import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Come negli altri test di rotta: il query layer è mockato, così la CI non ha bisogno di
// un Postgres attivo. Il filtro `collaboratorId` sulla lista è già coperto da
// `collaboratorFilter.test.ts` e non viene ripetuto qui.
vi.mock("../db/queries/intervention", () => ({
    listInterventions: vi.fn(),
    getInterventionById: vi.fn(),
    getInterventionDetailById: vi.fn(),
    createIntervention: vi.fn(),
    updateInterventionById: vi.fn(),
    deleteInterventionById: vi.fn(),
    getInterventionStats: vi.fn(),
}));

// Il collegamento al contratto legge il contratto dal query layer; il ricalcolo degli avvisi
// delle ore è mockato (lo coprono `assistanceHours.db.test.ts` e i test qui sotto sulle chiamate),
// mentre la tabella dei tipi consumati resta quella vera.
vi.mock("../db/queries/contract", () => ({
    getContractById: vi.fn(),
}));

vi.mock("../db/queries/customerDevice", () => ({
    listContractDeviceIds: vi.fn(),
}));

vi.mock("../services/assistanceHours", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../services/assistanceHours")>()),
    recheckAssistanceHours: vi.fn(),
}));

vi.mock("../config/lab", () => ({
    getLabConfig: vi.fn(),
    getAppTimeZone: vi.fn(async () => "Europe/Rome"),
}));

vi.mock("../services/interventionPdf", () => ({
    createInterventionPdfBuffer: vi.fn(),
}));

vi.mock("../services/interventionEmail", () => ({
    buildInterventionEmail: vi.fn(),
}));

vi.mock("../services/emailManager", () => ({
    sendEmail: vi.fn(),
}));

vi.mock("../services/logoManager", () => ({
    loadPrintableLogo: vi.fn(),
}));

import {
    createIntervention,
    deleteInterventionById,
    getInterventionById,
    getInterventionDetailById,
    getInterventionStats,
    listInterventions,
    updateInterventionById,
} from "../db/queries/intervention";
import { getContractById } from "../db/queries/contract";
import { listContractDeviceIds } from "../db/queries/customerDevice";
import { recheckAssistanceHours } from "../services/assistanceHours";
import { getLabConfig } from "../config/lab";
import { createInterventionPdfBuffer } from "../services/interventionPdf";
import { buildInterventionEmail } from "../services/interventionEmail";
import { sendEmail } from "../services/emailManager";
import { loadPrintableLogo } from "../services/logoManager";
import interventionsRouter from "./interventions";
import { errorHandler } from "../middleware/errorHandler";
import { exportRowLimit } from "../db/queries/pagination";
import { consumeEmailSendSlot, emailSendMaxPerWindow, resetEmailSendRateLimit } from "../services/emailSendRateLimit";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/interventions", interventionsRouter);
    app.use(errorHandler);
    return app;
};

const labConfig = {
    labName: "EasyLab",
    labEmail: "info@easylab.it",
    labAddress: "Via Roma 1",
    labPhone: "02 1234567",
    timeZone: "Europe/Rome",
};

// Quello che finisce nell'intestazione del PDF: il fuso serve solo a scrivere le date.
const { timeZone: _timeZone, ...labHeader } = labConfig;

// Riga così come la restituisce `getInterventionDetailById`, che servono anche stampa ed email.
const printRow = {
    id: 1,
    type: "customer_site",
    description: "Sostituito alimentatore",
    problem: "Non si accende",
    note: "Cliente da richiamare",
    toInvoice: true,
    status: "completed",
    interventionDate: "2026-01-10",
    startTime: "09:00:00",
    endTime: "10:00:00",
    created_at: new Date("2026-01-01T10:00:00Z"),
    customerName: "Mario Rossi",
    customerPhoneNumber: "02 1234567",
    customerPhoneSecondary: null,
    customerEmail: "mario.rossi@example.test",
    collaboratorName: "Luigi Bianchi",
};

// Riga così come la restituisce `getInterventionById`/`updateInterventionById`: colonne
// grezze della tabella, non quelle rinominate della query di stampa.
const storedIntervention = {
    id: 1,
    type: "material_delivery",
    description: "Consegnato alimentatore",
    problem: null,
    note: null,
    paid: false,
    toInvoice: false,
    status: "scheduled",
    interventionDate: "2026-01-10",
    startTime: null,
    endTime: null,
    customerId: 1,
    collaboratorId: 1,
    created_at: new Date("2026-01-01T10:00:00Z"),
    updated_at: null,
};

describe("interventions router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("GET /", () => {
        it("lista non paginata con status e type di default a 'all'", async () => {
            vi.mocked(listInterventions).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).get("/api/interventions");

            expect(response.status).toBe(200);
            expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({ status: "all", type: "all" });
        });

        it("inoltra tutti i filtri specifici della rotta alla query", async () => {
            vi.mocked(listInterventions).mockResolvedValue({ items: [], totalItems: 0 } as never);

            const response = await request(buildApp()).get(
                "/api/interventions?page=1&pageSize=10&status=completed&type=customer_site" +
                    "&dateFrom=2026-01-01&dateTo=2026-01-31&scheduledDate=2026-01-15" +
                    "&scheduledFrom=2026-01-01&scheduledTo=2026-01-31&sortBy=customer&sortOrder=asc&search=rossi"
            );

            expect(response.status).toBe(200);
            expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({
                status: "completed",
                type: "customer_site",
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                scheduledDate: "2026-01-15",
                scheduledFrom: "2026-01-01",
                scheduledTo: "2026-01-31",
                sortBy: "customer",
                sortOrder: "asc",
                search: "rossi",
            });
        });

        it("rifiuta uno status che non esiste", async () => {
            const response = await request(buildApp()).get("/api/interventions?status=annullato");

            expect(response.status).toBe(400);
            expect(listInterventions).not.toHaveBeenCalled();
        });

        it("rifiuta un sortBy fuori dall'insieme consentito per questa rotta", async () => {
            const response = await request(buildApp()).get("/api/interventions?sortBy=collaborator");

            expect(response.status).toBe(400);
            expect(listInterventions).not.toHaveBeenCalled();
        });

        it("rifiuta una data in un formato diverso da YYYY-MM-DD", async () => {
            const response = await request(buildApp()).get("/api/interventions?dateFrom=10-01-2026");

            expect(response.status).toBe(400);
            expect(listInterventions).not.toHaveBeenCalled();
        });
    });

    describe("GET /export.csv", () => {
        // Riga così come la restituisce `listInterventions` non paginato: cliente e
        // collaboratore già come nomi, non come id.
        const exportInterventionRow = {
            id: 4,
            customer: "Mario Rossi",
            customerPhone: "02 1234567",
            collaborator: "Luigi Verdi",
            type: "customer_site",
            status: "completed",
            interventionDate: "2026-01-15",
            startTime: "09:00",
            endTime: "10:30",
            problem: "Non si accende",
            description: "Sostituito alimentatore",
            note: "Cliente da richiamare",
            price: 120,
            paid: true,
            toInvoice: true,
            createdAt: new Date("2026-01-10T10:00:00Z"),
        };

        it("esporta con i filtri passati e le etichette italiane di tipo e stato", async () => {
            vi.mocked(listInterventions).mockResolvedValue([exportInterventionRow] as never);

            const response = await request(buildApp()).get(
                "/api/interventions/export.csv?status=completed&type=customer_site&dateFrom=2026-01-01&dateTo=2026-01-31"
            );

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("text/csv");
            expect(response.headers["content-disposition"]).toContain("interventi.csv");
            expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({
                status: "completed",
                type: "customer_site",
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                unpaginatedLimit: exportRowLimit,
            });
            expect(response.text).toContain("Intervento in sede");
            expect(response.text).toContain("Completato");
            expect(response.text).toContain("Non si accende");
            expect(response.text).toContain("Sostituito alimentatore");
            expect(response.text).toContain("Cliente da richiamare");
            expect(response.text).toContain("Pagato");
            expect(response.text).toContain("Da fatturare");
        });

        /** Senza filtri l'export scarica tutto: `status` e `type` tornano a "all". */
        it("senza filtri scarica l'archivio intero", async () => {
            vi.mocked(listInterventions).mockResolvedValue({ items: [exportInterventionRow], totalItems: 1 } as never);

            const response = await request(buildApp()).get("/api/interventions/export.csv");

            expect(response.status).toBe(200);
            expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({ status: "all", type: "all" });
        });

        /** La rotta sta prima di "/:id": senza, "export.csv" finirebbe nel dettaglio. */
        it("non viene scambiata per il dettaglio di un intervento", async () => {
            vi.mocked(listInterventions).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/interventions/export.csv");

            expect(response.status).toBe(200);
            expect(getInterventionDetailById).not.toHaveBeenCalled();
        });

        it("rifiuta un filtro di stato che non esiste", async () => {
            const response = await request(buildApp()).get("/api/interventions/export.csv?status=annullato");

            expect(response.status).toBe(400);
            expect(listInterventions).not.toHaveBeenCalled();
        });
    });

    describe("GET /stats", () => {
        it("restituisce il conteggio per stato", async () => {
            vi.mocked(getInterventionStats).mockResolvedValue({
                scheduledCount: 2,
                inProgressCount: 1,
                completedCount: 5,
            } as never);

            const response = await request(buildApp()).get("/api/interventions/stats");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ scheduledCount: 2, inProgressCount: 1, completedCount: 5 });
        });
    });

    describe("GET /:id/print", () => {
        it("risponde 404 quando l'intervento non esiste", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/interventions/999/print");

            expect(response.status).toBe(404);
            expect(createInterventionPdfBuffer).not.toHaveBeenCalled();
        });

        it("genera il pdf con i dati formattati e i giusti header di risposta", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([printRow] as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
            vi.mocked(createInterventionPdfBuffer).mockResolvedValue(Buffer.from("pdf-bytes") as never);

            const response = await request(buildApp()).get("/api/interventions/1/print");

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("application/pdf");
            expect(response.headers["content-disposition"]).toBe("inline; filename=intervento-1.pdf");
            expect(createInterventionPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 1,
                    customerName: "Mario Rossi",
                    customerPhone: "02 1234567",
                    customerEmail: "mario.rossi@example.test",
                    collaboratorName: "Luigi Bianchi",
                    interventionDateLabel: "10 gen 2026",
                    problem: "Non si accende",
                    description: "Sostituito alimentatore",
                    note: "Cliente da richiamare",
                    toInvoice: true,
                    ...labHeader,
                })
            );
        });
    });

    describe("POST /:id/send-email", () => {
        beforeEach(() => {
            resetEmailSendRateLimit();
        });

        it("oltre il tetto orario risponde 429 senza nemmeno caricare l'intervento", async () => {
            // Questa app di prova non ha `requireAuth`: gli invii finiscono nel contatore di ripiego.
            for (let sent = 0; sent < emailSendMaxPerWindow; sent += 1) {
                consumeEmailSendSlot("senza-utente");
            }

            const response = await request(buildApp()).post("/api/interventions/1/send-email");

            expect(response.status).toBe(429);
            expect(getInterventionDetailById).not.toHaveBeenCalled();
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("risponde 404 quando l'intervento non esiste", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([] as never);

            const response = await request(buildApp()).post("/api/interventions/999/send-email");

            expect(response.status).toBe(404);
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("risponde 400 quando il cliente non ha un'email", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([{ ...printRow, customerEmail: null }] as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);

            const response = await request(buildApp()).post("/api/interventions/1/send-email");

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Il cliente non ha un indirizzo email configurato");
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("invia l'email con pdf e logo allegati, nominando il file sulla data dell'intervento", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([printRow] as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
            vi.mocked(createInterventionPdfBuffer).mockResolvedValue(Buffer.from("pdf-bytes") as never);
            vi.mocked(loadPrintableLogo).mockResolvedValue({
                content: Buffer.from("logo-bytes"),
                contentType: "image/png",
            } as never);
            vi.mocked(buildInterventionEmail).mockReturnValue({
                subject: "Oggetto",
                text: "Testo",
                html: "<p>Html</p>",
            } as never);
            vi.mocked(sendEmail).mockResolvedValue(undefined as never);

            const response = await request(buildApp()).post("/api/interventions/1/send-email");

            expect(response.status).toBe(200);
            expect(buildInterventionEmail).toHaveBeenCalledWith(
                expect.objectContaining({ customerName: "Mario Rossi", day: "2026-01-10", logoCid: "logo-laboratorio" })
            );
            expect(sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: "mario.rossi@example.test",
                    replyTo: "info@easylab.it",
                    subject: "Oggetto",
                    attachments: [
                        expect.objectContaining({
                            filename: "intervento-2026-01-10.pdf",
                            contentType: "application/pdf",
                        }),
                        expect.objectContaining({
                            filename: "logo",
                            cid: "logo-laboratorio",
                            contentType: "image/png",
                        }),
                    ],
                })
            );
        });

        // Le due varianti "senza data intervento" che stavano qui sono state rimosse: dalla
        // migration 0037_intervention_date_not_null quello scenario non può più capitare
        // (vedi CHANGELOG del 2026-09-23).

        it("senza email del laboratorio non imposta un indirizzo di risposta", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([printRow] as never);
            vi.mocked(getLabConfig).mockResolvedValue({ ...labConfig, labEmail: "  " } as never);
            vi.mocked(createInterventionPdfBuffer).mockResolvedValue(Buffer.from("pdf-bytes") as never);
            vi.mocked(loadPrintableLogo).mockResolvedValue(null as never);
            vi.mocked(buildInterventionEmail).mockReturnValue({
                subject: "Oggetto",
                text: "Testo",
                html: "<p>Html</p>",
            } as never);
            vi.mocked(sendEmail).mockResolvedValue(undefined as never);

            const response = await request(buildApp()).post("/api/interventions/1/send-email");

            expect(response.status).toBe(200);
            expect(vi.mocked(sendEmail).mock.calls[0][0].replyTo).toBeUndefined();
        });
    });

    describe("GET /:id", () => {
        it("risponde 404 quando l'intervento non esiste", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/interventions/999");

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Intervento non trovato");
        });

        // Con i nomi: la pagina di dettaglio non scarica più l'elenco dei collaboratori.
        it("restituisce l'intervento trovato con i nomi di cliente e collaboratore", async () => {
            vi.mocked(getInterventionDetailById).mockResolvedValue([
                {
                    ...storedIntervention,
                    customerName: "Mario Rossi",
                    customerPhone: "02 1234567",
                    collaboratorName: "Luigi Bianchi",
                },
            ] as never);

            const response = await request(buildApp()).get("/api/interventions/1");

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: 1,
                customerName: "Mario Rossi",
                customerPhone: "02 1234567",
                collaboratorName: "Luigi Bianchi",
            });
            expect(getInterventionDetailById).toHaveBeenCalledWith(1);
        });
    });

    describe("POST /", () => {
        const minimalBody = {
            type: "material_delivery",
            customerId: 1,
            collaboratorId: 1,
            interventionDate: "2026-01-10",
        };

        it("crea una consegna materiale programmata azzerando i campi da intervento in sede", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).post("/api/interventions").send(minimalBody);

            expect(response.status).toBe(201);
            expect(createIntervention).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "scheduled",
                    description: null,
                    problem: null,
                    startTime: null,
                    endTime: null,
                })
            );
        });

        it("crea un intervento in sede completato con tutti i campi richiesti", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).post("/api/interventions").send({
                type: "customer_site",
                status: "completed",
                customerId: 1,
                collaboratorId: 1,
                interventionDate: "2026-01-10",
                description: "Sostituita batteria",
                problem: "Non si accende",
                startTime: "09:00",
                endTime: "10:00",
            });

            expect(response.status).toBe(201);
            expect(createIntervention).toHaveBeenCalledWith(
                expect.objectContaining({
                    problem: "Non si accende",
                    startTime: "09:00",
                    endTime: "10:00",
                    description: "Sostituita batteria",
                })
            );
        });

        it("il prezzo è facoltativo: senza indicarlo resta null", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            await request(buildApp()).post("/api/interventions").send(minimalBody);

            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ price: null }));
        });

        it("crea un intervento con il prezzo indicato", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, price: 45 });

            expect(response.status).toBe(201);
            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ price: 45 }));
        });

        it("senza indicarlo il pagamento resta non pagato", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            await request(buildApp()).post("/api/interventions").send(minimalBody);

            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ paid: false }));
        });

        it("crea un intervento già pagato", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, paid: true });

            expect(response.status).toBe(201);
            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ paid: true }));
        });

        it("senza indicarlo l'intervento non è da fatturare", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            await request(buildApp()).post("/api/interventions").send(minimalBody);

            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ toInvoice: false }));
        });

        it("crea un intervento da fatturare", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, toInvoice: true });

            expect(response.status).toBe(201);
            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ toInvoice: true }));
        });

        it("rifiuta un prezzo negativo", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, price: -1 });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("rifiuta la creazione senza data dell'intervento", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ type: "material_delivery", customerId: 1, collaboratorId: 1 });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("non richiede la descrizione a un intervento in lavorazione", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, status: "in_progress" });

            expect(response.status).not.toBe(400);
            expect(createIntervention).toHaveBeenCalled();
        });

        it("richiede la descrizione quando l'intervento è completato", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, status: "completed" });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("richiede il problema riscontrato per un intervento in sede anche se solo programmato", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, type: "customer_site" });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("non richiede ora inizio e fine a un intervento in sede in lavorazione", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp())
                .post("/api/interventions")
                .send({
                    ...minimalBody,
                    type: "remote",
                    status: "in_progress",
                    problem: "Non si accende",
                });

            expect(response.status).not.toBe(400);
            expect(createIntervention).toHaveBeenCalled();
        });

        it("richiede ora inizio e fine a un intervento in sede completato", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({
                    ...minimalBody,
                    type: "remote",
                    status: "completed",
                    problem: "Non si accende",
                    description: "Fatto",
                });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("rifiuta un'ora di fine non successiva a quella di inizio", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({
                    ...minimalBody,
                    type: "remote",
                    status: "in_progress",
                    problem: "Non si accende",
                    description: "In corso",
                    startTime: "10:00",
                    endTime: "09:00",
                });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("rifiuta un campo non previsto dallo schema", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, extra: "non dovrebbe esserci" });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });
    });

    describe("PUT /:id", () => {
        it("rifiuta un corpo senza campi", async () => {
            const response = await request(buildApp()).put("/api/interventions/1").send({});

            expect(response.status).toBe(400);
            // Stesso testo delle altre anagrafiche (D6, BE-B): prima qui c'era l'inglese
            // "At least one field is required".
            expect(response.body.message).toBe("È necessario specificare almeno un campo");
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("risponde 404 quando l'intervento non esiste", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([] as never);

            const response = await request(buildApp()).put("/api/interventions/999").send({ note: "Nuova nota" });

            expect(response.status).toBe(404);
        });

        it("aggiorna un campo mantenendo il resto della riga esistente", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([storedIntervention] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([
                { ...storedIntervention, note: "Richiamare" },
            ] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ note: "Richiamare" });

            expect(response.status).toBe(200);
            expect(updateInterventionById).toHaveBeenCalledWith(
                1,
                expect.objectContaining({
                    note: "Richiamare",
                    description: storedIntervention.description,
                    problem: null,
                })
            );
        });

        it("aggiorna il prezzo mantenendo il resto della riga esistente", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([storedIntervention] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([{ ...storedIntervention, price: 60 }] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ price: 60 });

            expect(response.status).toBe(200);
            expect(updateInterventionById).toHaveBeenCalledWith(1, expect.objectContaining({ price: 60 }));
        });

        it("rifiuta di azzerare la data dell'intervento", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ interventionDate: null });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("richiede la descrizione quando lo stato passa a 'completed' e la riga esistente non ce l'ha", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([{ ...storedIntervention, description: null }] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ status: "completed" });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("mette in lavorazione un intervento in sede senza descrizione né orari", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([
                {
                    ...storedIntervention,
                    type: "customer_site",
                    problem: "Non si accende",
                    description: null,
                    startTime: null,
                    endTime: null,
                },
            ] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ status: "in_progress" });

            expect(response.status).not.toBe(400);
            expect(updateInterventionById).toHaveBeenCalled();
        });

        it("richiede il problema riscontrato quando il tipo passa a un intervento in sede", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ type: "customer_site" });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("richiede ora inizio e fine quando un intervento in sede diventa completato", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([
                { ...storedIntervention, type: "customer_site", problem: "Non si accende" },
            ] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ status: "completed" });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("rifiuta un'ora di fine non successiva a quella di inizio", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([
                { ...storedIntervention, type: "customer_site", problem: "Non si accende" },
            ] as never);

            const response = await request(buildApp())
                .put("/api/interventions/1")
                .send({ startTime: "10:00", endTime: "09:00" });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("risponde 404 se la riga sparisce fra il controllo e l'aggiornamento", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([storedIntervention] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ note: "Nuova nota" });

            expect(response.status).toBe(404);
        });
    });

    /**
     * La prova concreta che la duplicazione è sparita: POST e PUT chiamano entrambe
     * `validateInterventionRow` (vedi ./interventions.ts), quindi per la stessa regola violata
     * danno lo stesso messaggio, carattere per carattere — non solo lo stesso status. Prima la
     * POST (`.superRefine()` sullo schema) e la PUT (`if` a mano) potevano dire cose diverse per
     * lo stesso caso, come infatti facevano per l'ora di inizio/fine mancante (un solo messaggio
     * combinato sulla PUT, due messaggi separati sulla POST).
     */
    describe("POST / e PUT /:id danno lo stesso messaggio per la stessa regola violata", () => {
        // Riga "completa e in sede": ogni caso qui sotto la modifica solo nel punto che vuole
        // rompere, così la PUT isola la violazione senza dover ricalcolare il resto a mano.
        const completeOnSiteExisting = {
            ...storedIntervention,
            type: "customer_site",
            status: "completed",
            problem: "Non si accende",
            description: "Fatto",
            startTime: "09:00",
            endTime: "10:00",
        };

        const onSiteBase = {
            type: "customer_site",
            customerId: 1,
            collaboratorId: 1,
            interventionDate: "2026-01-10",
            problem: "Non si accende",
            status: "completed",
            description: "Fatto",
            startTime: "09:00",
            endTime: "10:00",
        };

        it.each([
            [
                "data dell'intervento mancante",
                { ...onSiteBase, interventionDate: undefined },
                { interventionDate: null },
            ],
            ["descrizione mancante a completamento", { ...onSiteBase, description: undefined }, { description: null }],
            [
                "problema riscontrato mancante su un intervento in sede",
                { ...onSiteBase, problem: undefined },
                { problem: null },
            ],
            ["ora di inizio mancante a completamento", { ...onSiteBase, startTime: undefined }, { startTime: null }],
            ["ora di fine mancante a completamento", { ...onSiteBase, endTime: undefined }, { endTime: null }],
            [
                "ora di fine non successiva a quella di inizio",
                { ...onSiteBase, startTime: "10:00", endTime: "09:00" },
                { startTime: "10:00", endTime: "09:00" },
            ],
        ])("%s", async (_label, createBody, updatePatch) => {
            const createResponse = await request(buildApp()).post("/api/interventions").send(createBody);

            expect(createResponse.status).toBe(400);

            vi.mocked(getInterventionById).mockResolvedValue([completeOnSiteExisting] as never);

            const updateResponse = await request(buildApp()).put("/api/interventions/1").send(updatePatch);

            expect(updateResponse.status).toBe(400);
            expect(updateResponse.body.message).toBe(createResponse.body.message);
        });
    });

    describe("collegamento a un contratto di assistenza", () => {
        // Un contratto Assistenza Remota Pack 20 del cliente 1, valido per tutto il 2026.
        const contract = {
            id: 5,
            type: "assistance",
            customerId: 1,
            effectiveStatus: "active",
            startDate: "2026-01-01",
            endDate: "2027-01-01",
            package: "remote_20",
        };

        const linkedBody = {
            type: "remote",
            customerId: 1,
            collaboratorId: 1,
            interventionDate: "2026-01-10",
            problem: "Non si accende",
            contractId: 5,
        };

        const linkedStored = { ...storedIntervention, type: "remote", problem: "Non si accende", contractId: 5 };

        beforeEach(() => {
            vi.mocked(getContractById).mockResolvedValue([contract] as never);
            vi.mocked(createIntervention).mockResolvedValue([linkedStored] as never);
        });

        describe("dispositivo del contratto", () => {
            beforeEach(() => {
                vi.mocked(listContractDeviceIds).mockResolvedValue([11, 12]);
            });

            it("POST accetta un dispositivo fra quelli del contratto", async () => {
                const response = await request(buildApp())
                    .post("/api/interventions")
                    .send({ ...linkedBody, customerDeviceId: 11 });

                expect(response.status).toBe(201);
                expect(listContractDeviceIds).toHaveBeenCalledWith(5);
                expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ customerDeviceId: 11 }));
            });

            it("POST rifiuta un dispositivo che non è del contratto", async () => {
                const response = await request(buildApp())
                    .post("/api/interventions")
                    .send({ ...linkedBody, customerDeviceId: 99 });

                expect(response.status).toBe(400);
                expect(response.body).toEqual({
                    message: "Il dispositivo selezionato non è fra quelli del contratto",
                    field: "customerDeviceId",
                });
                expect(createIntervention).not.toHaveBeenCalled();
            });

            it("POST rifiuta un dispositivo senza contratto", async () => {
                const response = await request(buildApp())
                    .post("/api/interventions")
                    .send({ ...linkedBody, contractId: null, customerDeviceId: 11 });

                expect(response.status).toBe(400);
                expect(response.body.field).toBe("customerDeviceId");
                expect(createIntervention).not.toHaveBeenCalled();
            });

            it("POST senza dispositivo non interroga i dispositivi del contratto", async () => {
                const response = await request(buildApp()).post("/api/interventions").send(linkedBody);

                expect(response.status).toBe(201);
                expect(listContractDeviceIds).not.toHaveBeenCalled();
                expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ customerDeviceId: null }));
            });

            it("PUT cambiando contratto rifiuta il dispositivo di prima se non è del nuovo contratto", async () => {
                vi.mocked(getInterventionById).mockResolvedValue([
                    { ...linkedStored, contractId: 4, customerDeviceId: 31 },
                ] as never);

                const response = await request(buildApp()).put("/api/interventions/1").send({ contractId: 5 });

                expect(response.status).toBe(400);
                expect(response.body.field).toBe("customerDeviceId");
                expect(updateInterventionById).not.toHaveBeenCalled();
            });

            it("PUT cambiando contratto e dispositivo insieme accetta quello del nuovo contratto", async () => {
                vi.mocked(getInterventionById).mockResolvedValue([
                    { ...linkedStored, contractId: 4, customerDeviceId: 31 },
                ] as never);
                vi.mocked(updateInterventionById).mockResolvedValue([linkedStored] as never);

                const response = await request(buildApp())
                    .put("/api/interventions/1")
                    .send({ contractId: 5, customerDeviceId: 12 });

                expect(response.status).toBe(200);
                expect(updateInterventionById).toHaveBeenCalledWith(
                    1,
                    expect.objectContaining({ contractId: 5, customerDeviceId: 12 })
                );
            });

            it("PUT scollegando il contratto senza togliere il dispositivo è rifiutato; con null va bene", async () => {
                vi.mocked(getInterventionById).mockResolvedValue([{ ...linkedStored, customerDeviceId: 11 }] as never);
                vi.mocked(updateInterventionById).mockResolvedValue([linkedStored] as never);

                const rejected = await request(buildApp()).put("/api/interventions/1").send({ contractId: null });
                const accepted = await request(buildApp())
                    .put("/api/interventions/1")
                    .send({ contractId: null, customerDeviceId: null });

                expect(rejected.status).toBe(400);
                expect(accepted.status).toBe(200);
            });

            it("PUT di un campo estraneo non ricontrolla il dispositivo", async () => {
                vi.mocked(getInterventionById).mockResolvedValue([{ ...linkedStored, customerDeviceId: 11 }] as never);
                vi.mocked(updateInterventionById).mockResolvedValue([linkedStored] as never);

                const response = await request(buildApp()).put("/api/interventions/1").send({ note: "x" });

                expect(response.status).toBe(200);
                expect(listContractDeviceIds).not.toHaveBeenCalled();
            });

            it("il dettaglio restituisce il dispositivo ripiegato in `customerDevice`", async () => {
                vi.mocked(getInterventionDetailById).mockResolvedValue([
                    {
                        ...linkedStored,
                        customerDeviceId: 11,
                        deviceType: "server",
                        deviceName: "NAS",
                        deviceSerialNumber: "SN-1",
                        deviceModel: null,
                    },
                ] as never);

                const response = await request(buildApp()).get("/api/interventions/1");

                expect(response.body.customerDevice).toEqual({
                    id: 11,
                    type: "server",
                    name: "NAS",
                    serialNumber: "SN-1",
                    model: null,
                });
                expect(response.body).not.toHaveProperty("deviceName");
            });
        });

        it("la lista inoltra il filtro per contratto", async () => {
            vi.mocked(listInterventions).mockResolvedValue([] as never);

            await request(buildApp()).get("/api/interventions?contractId=5");

            expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({ contractId: 5 });
        });

        it("crea l'intervento collegato e ricalcola le ore del suo mese", async () => {
            const response = await request(buildApp()).post("/api/interventions").send(linkedBody);

            expect(response.status).toBe(201);
            expect(getContractById).toHaveBeenCalledWith(5, "Europe/Rome");
            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ contractId: 5 }));
            expect(recheckAssistanceHours).toHaveBeenCalledWith([{ contractId: 5, month: "2026-01" }]);
        });

        it("senza contratto non legge nessun contratto e salva contractId null", async () => {
            vi.mocked(createIntervention).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...linkedBody, contractId: null });

            expect(response.status).toBe(201);
            expect(getContractById).not.toHaveBeenCalled();
            expect(createIntervention).toHaveBeenCalledWith(expect.objectContaining({ contractId: null }));
        });

        it.each([
            ["il contratto non esiste", undefined, {}, "Il contratto selezionato non esiste"],
            [
                "il contratto non è di assistenza",
                { ...contract, type: "rental", package: null },
                {},
                "Si può collegare solo un contratto di assistenza",
            ],
            [
                "il contratto è di un altro cliente",
                { ...contract, customerId: 2 },
                {},
                "Il contratto selezionato appartiene a un altro cliente",
            ],
            [
                "il contratto è in bozza",
                { ...contract, effectiveStatus: "draft" },
                {},
                "Il contratto selezionato non è attivo",
            ],
            [
                "il contratto è scaduto",
                { ...contract, effectiveStatus: "expired" },
                {},
                "Il contratto selezionato non è attivo",
            ],
            [
                "la data precede l'inizio del contratto",
                contract,
                { interventionDate: "2025-12-31" },
                "La data dell'intervento non rientra nel periodo del contratto",
            ],
            [
                "la data è quella di fine (esclusa)",
                contract,
                { interventionDate: "2027-01-01" },
                "La data dell'intervento non rientra nel periodo del contratto",
            ],
            [
                "il pacchetto remoto non consuma gli interventi in sede",
                contract,
                { type: "customer_site" },
                "Questo tipo di intervento non consuma le ore del pacchetto del contratto selezionato",
            ],
            [
                "la consegna di materiale non consuma mai",
                { ...contract, package: "ready_60" },
                { type: "material_delivery" },
                "Questo tipo di intervento non consuma le ore del pacchetto del contratto selezionato",
            ],
        ])("POST rifiuta se %s", async (_label, foundContract, patch, message) => {
            vi.mocked(getContractById).mockResolvedValue((foundContract ? [foundContract] : []) as never);

            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...linkedBody, ...patch });

            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({ message, field: "contractId" });
            expect(createIntervention).not.toHaveBeenCalled();
            expect(recheckAssistanceHours).not.toHaveBeenCalled();
        });

        it.each(["ready_20", "support_plus"])(
            "il pacchetto %s accetta remoto, intervento in sede e in laboratorio",
            async (key) => {
                vi.mocked(getContractById).mockResolvedValue([{ ...contract, package: key }] as never);

                for (const type of ["remote", "customer_site", "lab"]) {
                    const response = await request(buildApp())
                        .post("/api/interventions")
                        .send({ ...linkedBody, type });

                    expect(response.status).toBe(201);
                }
            }
        );

        it("PUT valida la riga risultante: spostare la data fuori dal contratto è un 400", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([linkedStored] as never);

            const response = await request(buildApp())
                .put("/api/interventions/1")
                .send({ interventionDate: "2027-02-01" });

            expect(response.status).toBe(400);
            expect(response.body.field).toBe("contractId");
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("PUT: cambiando tipo in uno non consumato dal pacchetto è un 400", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([linkedStored] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ type: "customer_site" });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain("non consuma le ore");
        });

        it("PUT collega un contratto a un intervento che non lo aveva", async () => {
            const existing = { ...linkedStored, contractId: null };
            vi.mocked(getInterventionById).mockResolvedValue([existing] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([linkedStored] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ contractId: 5 });

            expect(response.status).toBe(200);
            expect(updateInterventionById).toHaveBeenCalledWith(1, expect.objectContaining({ contractId: 5 }));
        });

        it("PUT di un campo estraneo non ricontrolla il contratto (può essere scaduto nel frattempo)", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([linkedStored] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([{ ...linkedStored, note: "x" }] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ note: "x" });

            expect(response.status).toBe(200);
            expect(getContractById).not.toHaveBeenCalled();
        });

        it("PUT ricalcola il posto di partenza e quello di arrivo (contratto e mese)", async () => {
            const existing = { ...linkedStored, contractId: 4, interventionDate: "2025-12-20" };
            vi.mocked(getInterventionById).mockResolvedValue([existing] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([linkedStored] as never);

            const response = await request(buildApp())
                .put("/api/interventions/1")
                .send({ contractId: 5, interventionDate: "2026-01-10" });

            expect(response.status).toBe(200);
            expect(recheckAssistanceHours).toHaveBeenCalledWith([
                { contractId: 4, month: "2025-12" },
                { contractId: 5, month: "2026-01" },
            ]);
        });

        it("PUT con contractId null scollega l'intervento", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([linkedStored] as never);
            vi.mocked(updateInterventionById).mockResolvedValue([{ ...linkedStored, contractId: null }] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ contractId: null });

            expect(response.status).toBe(200);
            expect(getContractById).not.toHaveBeenCalled();
            expect(updateInterventionById).toHaveBeenCalledWith(1, expect.objectContaining({ contractId: null }));
        });

        it("DELETE ricalcola le ore del contratto e del mese dell'intervento tolto", async () => {
            vi.mocked(deleteInterventionById).mockResolvedValue([linkedStored] as never);

            const response = await request(buildApp()).delete("/api/interventions/1");

            expect(response.status).toBe(200);
            expect(recheckAssistanceHours).toHaveBeenCalledWith([{ contractId: 5, month: "2026-01" }]);
        });
    });

    describe("DELETE /:id", () => {
        it("elimina un intervento esistente", async () => {
            vi.mocked(deleteInterventionById).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).delete("/api/interventions/1");

            expect(response.status).toBe(200);
            expect(deleteInterventionById).toHaveBeenCalledWith(1);
        });

        it("risponde 404 quando l'intervento non esiste", async () => {
            vi.mocked(deleteInterventionById).mockResolvedValue([] as never);

            const response = await request(buildApp()).delete("/api/interventions/999");

            expect(response.status).toBe(404);
        });

        it("propaga la violazione di FK sul cliente come 400", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            vi.mocked(deleteInterventionById).mockRejectedValue(
                Object.assign(new Error('update or delete on table "customer" violates foreign key constraint'), {
                    code: "23503",
                    constraint: "intervention_customer_id_customer_id_fk",
                })
            );

            const response = await request(buildApp()).delete("/api/interventions/1");

            expect(response.status).toBe(400);
            expect(response.body.message).toContain("Impossibile eliminare il cliente");
        });
    });
});
