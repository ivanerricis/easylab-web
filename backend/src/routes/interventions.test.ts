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

// `/:id/print` e `/:id/send-email` interrogano `db` direttamente (join su cliente e
// collaboratore), senza passare dal query layer: va mockato a parte con un costruttore
// concatenabile, come già fa `authManager.test.ts` per lo stesso motivo.
type SelectBuilder = {
    from: () => SelectBuilder;
    innerJoin: () => SelectBuilder;
    where: () => SelectBuilder;
    then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
};

const queryResult = (rows: unknown[]): SelectBuilder => {
    const builder: SelectBuilder = {
        from: () => builder,
        innerJoin: () => builder,
        where: () => builder,
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    return builder;
};

vi.mock("../db", () => ({
    db: { select: vi.fn() },
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
import { db } from "../db";
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

// Riga così come la restituisce la query congiunta di `/:id/print` e `/:id/send-email`.
const printRow = {
    id: 1,
    type: "intervento_sede",
    description: "Sostituito alimentatore",
    problem: "Non si accende",
    note: "Cliente da richiamare",
    toInvoice: true,
    status: "completato",
    interventionDate: "2026-01-10",
    startTime: "09:00:00",
    endTime: "10:00:00",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    customerFirstName: "Mario",
    customerLastName: "Rossi",
    customerPhone: "02 1234567",
    customerPhoneSecondary: null,
    customerEmail: "mario.rossi@example.test",
    collaboratorFirstName: "Luigi",
    collaboratorLastName: "Bianchi",
};

// Riga così come la restituisce `getInterventionById`/`updateInterventionById`: colonne
// grezze della tabella, non quelle rinominate della query di stampa.
const storedIntervention = {
    id: 1,
    type: "consegna_materiale",
    description: "Consegnato alimentatore",
    problem: null,
    note: null,
    paid: false,
    toInvoice: false,
    status: "programmato",
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
                "/api/interventions?page=1&pageSize=10&status=completato&type=intervento_sede" +
                    "&dateFrom=2026-01-01&dateTo=2026-01-31&scheduledDate=2026-01-15" +
                    "&scheduledFrom=2026-01-01&scheduledTo=2026-01-31&sortBy=customer&sortOrder=asc&search=rossi"
            );

            expect(response.status).toBe(200);
            expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({
                status: "completato",
                type: "intervento_sede",
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
            type: "intervento_sede",
            status: "completato",
            interventionDate: "2026-01-15",
            startTime: "09:00",
            endTime: "10:30",
            description: "Sostituito alimentatore",
            price: 120,
            paid: true,
            toInvoice: true,
            createdAt: new Date("2026-01-10T10:00:00Z"),
        };

        it("esporta con i filtri passati e le etichette italiane di tipo e stato", async () => {
            vi.mocked(listInterventions).mockResolvedValue([exportInterventionRow] as never);

            const response = await request(buildApp()).get(
                "/api/interventions/export.csv?status=completato&type=intervento_sede&dateFrom=2026-01-01&dateTo=2026-01-31"
            );

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("text/csv");
            expect(response.headers["content-disposition"]).toContain("interventi.csv");
            expect(vi.mocked(listInterventions).mock.calls[0][0]).toMatchObject({
                status: "completato",
                type: "intervento_sede",
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                unpaginatedLimit: exportRowLimit,
            });
            expect(response.text).toContain("Intervento in sede");
            expect(response.text).toContain("Completato");
            expect(response.text).toContain("Sostituito alimentatore");
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
                programmatoCount: 2,
                inLavorazioneCount: 1,
                completatoCount: 5,
            } as never);

            const response = await request(buildApp()).get("/api/interventions/stats");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ programmatoCount: 2, inLavorazioneCount: 1, completatoCount: 5 });
        });
    });

    describe("GET /:id/print", () => {
        it("risponde 404 quando l'intervento non esiste", async () => {
            vi.mocked(db.select).mockReturnValue(queryResult([]) as never);

            const response = await request(buildApp()).get("/api/interventions/999/print");

            expect(response.status).toBe(404);
            expect(createInterventionPdfBuffer).not.toHaveBeenCalled();
        });

        it("genera il pdf con i dati formattati e i giusti header di risposta", async () => {
            vi.mocked(db.select).mockReturnValue(queryResult([printRow]) as never);
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
                    createdAtLabel: "1 gen 2026",
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
            expect(db.select).not.toHaveBeenCalled();
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("risponde 404 quando l'intervento non esiste", async () => {
            vi.mocked(db.select).mockReturnValue(queryResult([]) as never);

            const response = await request(buildApp()).post("/api/interventions/999/send-email");

            expect(response.status).toBe(404);
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("risponde 400 quando il cliente non ha un'email", async () => {
            vi.mocked(db.select).mockReturnValue(queryResult([{ ...printRow, customerEmail: null }]) as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);

            const response = await request(buildApp()).post("/api/interventions/1/send-email");

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Il cliente non ha un indirizzo email configurato");
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("invia l'email con pdf e logo allegati, nominando il file sulla data dell'intervento", async () => {
            vi.mocked(db.select).mockReturnValue(queryResult([printRow]) as never);
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
                expect.objectContaining({ customerName: "Mario Rossi", logoCid: "logo-laboratorio" })
            );
            expect(sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: "mario.rossi@example.test",
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

        it("senza data intervento e senza logo usa la data di creazione e non allega il logo", async () => {
            vi.mocked(db.select).mockReturnValue(
                queryResult([
                    { ...printRow, interventionDate: null, createdAt: new Date("2026-03-05T12:00:00Z") },
                ]) as never
            );
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
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
            expect(buildInterventionEmail).toHaveBeenCalledWith(expect.objectContaining({ logoCid: null }));
            const attachments = vi.mocked(sendEmail).mock.calls[0][0].attachments;
            expect(attachments).toHaveLength(1);
            expect(attachments?.[0].filename).toBe("intervento-2026-03-05.pdf");
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
            type: "consegna_materiale",
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
                    status: "programmato",
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
                type: "intervento_sede",
                status: "completato",
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
                .send({ type: "consegna_materiale", customerId: 1, collaboratorId: 1 });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("richiede la descrizione quando lo stato non è solo 'programmato'", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, status: "completato" });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("richiede il problema riscontrato per un intervento in sede anche se solo programmato", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({ ...minimalBody, type: "intervento_sede" });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("richiede ora inizio e fine per un intervento in sede non solo programmato", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({
                    ...minimalBody,
                    type: "intervento_remoto",
                    status: "in_lavorazione",
                    problem: "Non si accende",
                    description: "In corso",
                });

            expect(response.status).toBe(400);
            expect(createIntervention).not.toHaveBeenCalled();
        });

        it("rifiuta un'ora di fine non successiva a quella di inizio", async () => {
            const response = await request(buildApp())
                .post("/api/interventions")
                .send({
                    ...minimalBody,
                    type: "intervento_remoto",
                    status: "in_lavorazione",
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

        it("richiede la descrizione quando lo stato passa a non 'programmato' e la riga esistente non ce l'ha", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([{ ...storedIntervention, description: null }] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ status: "in_lavorazione" });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("richiede il problema riscontrato quando il tipo passa a un intervento in sede", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([storedIntervention] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ type: "intervento_sede" });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("richiede ora inizio e fine quando un intervento in sede non è più solo programmato", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([
                { ...storedIntervention, type: "intervento_sede", problem: "Non si accende" },
            ] as never);

            const response = await request(buildApp()).put("/api/interventions/1").send({ status: "completato" });

            expect(response.status).toBe(400);
            expect(updateInterventionById).not.toHaveBeenCalled();
        });

        it("rifiuta un'ora di fine non successiva a quella di inizio", async () => {
            vi.mocked(getInterventionById).mockResolvedValue([
                { ...storedIntervention, type: "intervento_sede", problem: "Non si accende" },
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
