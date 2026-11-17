import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Come negli altri test di rotta: il query layer è mockato. Le query vere (stato effettivo,
// filtri, transazione) sono coperte da `db/queries/contract.db.test.ts`.
vi.mock("../db/queries/contract", () => ({
    listContracts: vi.fn(),
    getContractById: vi.fn(),
    hasLinkedInterventions: vi.fn(),
    createContract: vi.fn(),
    updateContractById: vi.fn(),
    deleteContractById: vi.fn(),
    getSignedContract: vi.fn(),
    saveSignedContract: vi.fn(),
    deleteSignedContract: vi.fn(),
}));

vi.mock("../services/emailManager", () => ({ sendEmail: vi.fn() }));
vi.mock("../services/logoManager", () => ({ loadPrintableLogo: vi.fn() }));

// I file su disco li coprono i test di `signedContractFiles`: qui conta l'ordine delle chiamate.
const stagedFile = vi.hoisted(() => ({ commit: vi.fn(), discard: vi.fn() }));
vi.mock("../services/signedContractFiles", () => ({
    stageSignedContractFile: vi.fn(async () => stagedFile),
    readSignedContractFile: vi.fn(),
    removeSignedContractFile: vi.fn(),
}));

// Le ore (query sugli interventi e avvisi) sono coperte da `services/assistanceHours.db.test.ts`.
vi.mock("../services/assistanceHours", async (importOriginal) => ({
    // `consumingInterventionTypes` è la tabella vera: serve a tradurre gli interventi coperti.
    ...(await importOriginal<typeof import("../services/assistanceHours")>()),
    getContractHoursSummary: vi.fn(),
    resetAssistanceAlerts: vi.fn(),
}));

vi.mock("../services/contractPdf", () => ({ createContractPdfBuffer: vi.fn() }));
vi.mock("../db/queries/customer", () => ({ getCustomerById: vi.fn() }));
vi.mock("../db/queries/provider", () => ({ getProviderById: vi.fn() }));

vi.mock("../config/lab", () => ({
    getLabConfig: vi.fn(),
    getAppTimeZone: vi.fn(async () => "Europe/Rome"),
}));

import {
    createContract,
    deleteContractById,
    deleteSignedContract,
    getContractById,
    getSignedContract,
    hasLinkedInterventions,
    listContracts,
    saveSignedContract,
    updateContractById,
} from "../db/queries/contract";
import { sendEmail } from "../services/emailManager";
import { consumeEmailSendSlot, emailSendMaxPerWindow, resetEmailSendRateLimit } from "../services/emailSendRateLimit";
import { loadPrintableLogo } from "../services/logoManager";
import {
    readSignedContractFile,
    removeSignedContractFile,
    stageSignedContractFile,
} from "../services/signedContractFiles";
import { getCustomerById } from "../db/queries/customer";
import { getProviderById } from "../db/queries/provider";
import { getLabConfig } from "../config/lab";
import { getContractHoursSummary, resetAssistanceAlerts } from "../services/assistanceHours";
import { createContractPdfBuffer } from "../services/contractPdf";
import contractsRouter from "./contracts";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/contracts", contractsRouter);
    app.use(errorHandler);
    return app;
};

const flatRow = {
    id: 7,
    type: "assistance",
    status: "active",
    effectiveStatus: "active",
    termMonths: 12,
    billingMonths: null,
    device: "Server NAS",
    note: null,
    startDate: "2026-10-01",
    endDate: "2027-10-01",
    customerId: 3,
    customerName: "Mario Rossi",
    providerId: 2,
    providerName: "Acme Srl",
    package: "ready_20",
    includedHours: 20,
    priceCents: 50000,
    signedFileName: null,
    signedSizeBytes: null,
    signedUploadedAt: null,
    created_at: "2026-10-01T08:00:00.000Z",
    updated_at: null,
};

const dto = {
    id: 7,
    type: "assistance",
    status: "active",
    effectiveStatus: "active",
    termMonths: 12,
    billingMonths: null,
    device: "Server NAS",
    note: null,
    startDate: "2026-10-01",
    endDate: "2027-10-01",
    customerId: 3,
    customerName: "Mario Rossi",
    providerId: 2,
    providerName: "Acme Srl",
    assistance: {
        package: "ready_20",
        name: "Pronti Via 20",
        includedHours: 20,
        priceCents: 50000,
        period: "month",
        priority: 3,
        typology: "Teleassistenza, on site e in laboratorio: hardware, software, formazione",
    },
    signedContract: null,
    created_at: "2026-10-01T08:00:00.000Z",
    updated_at: null,
};

const rentalRow = {
    ...flatRow,
    id: 8,
    type: "rental",
    billingMonths: 3,
    package: null,
    includedHours: null,
    priceCents: null,
};

const supportRow = { ...flatRow, package: "support_base", includedHours: 80, priceCents: 160000 };

const assistanceBody = {
    type: "assistance",
    termMonths: 12,
    device: "Server NAS",
    startDate: "2026-10-01",
    customerId: 3,
    providerId: 2,
    assistance: { package: "ready_20" },
};

const hoursSummary = {
    hours: { period: "month", month: "2026-10", usedHours: 12.5, includedHours: 20, remainingHours: 7.5 },
    monthlyHours: [
        { month: "2026-10", usedHours: 12.5 },
        { month: "2026-09", usedHours: 3 },
    ],
};

describe("contracts router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getContractHoursSummary).mockResolvedValue(hoursSummary as never);
    });

    describe("lettura", () => {
        it("restituisce il contratto con l'assistenza annidata", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp()).get("/api/contracts/7");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ...dto, ...hoursSummary });
            expect(getContractById).toHaveBeenCalledWith(7, "Europe/Rome");
            // Il mese corrente è quello del laboratorio, nel formato YYYY-MM.
            expect(getContractHoursSummary).toHaveBeenCalledWith(
                7,
                "ready_20",
                20,
                expect.stringMatching(/^\d{4}-\d{2}$/)
            );
        });

        it("per il noleggio `hours` è null, lo storico è vuoto e le ore non si calcolano", async () => {
            vi.mocked(getContractById).mockResolvedValue([rentalRow] as never);

            const response = await request(buildApp()).get("/api/contracts/8");

            expect(response.body).toMatchObject({ hours: null, monthlyHours: [] });
            expect(getContractHoursSummary).not.toHaveBeenCalled();
        });

        it("la lista non calcola le ore", async () => {
            vi.mocked(listContracts).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp()).get("/api/contracts");

            expect(response.body[0]).not.toHaveProperty("hours");
            expect(getContractHoursSummary).not.toHaveBeenCalled();
        });

        it("per il noleggio `assistance` è null", async () => {
            vi.mocked(getContractById).mockResolvedValue([rentalRow] as never);

            const response = await request(buildApp()).get("/api/contracts/8");

            expect(response.body.assistance).toBeNull();
            expect(response.body).not.toHaveProperty("package");
        });

        it("un Supporto ha periodo `contract`, priorità e prezzo unico nel DTO", async () => {
            vi.mocked(getContractById).mockResolvedValue([supportRow] as never);
            vi.mocked(getContractHoursSummary).mockResolvedValue({
                hours: { period: "contract", month: null, usedHours: 10, includedHours: 80, remainingHours: 70 },
                monthlyHours: [],
            } as never);

            const response = await request(buildApp()).get("/api/contracts/7");

            expect(response.body.assistance).toMatchObject({
                package: "support_base",
                name: "Supporto Base",
                includedHours: 80,
                priceCents: 160000,
                period: "contract",
                priority: 2,
            });
            expect(response.body.hours).toMatchObject({ period: "contract", month: null });
            expect(getContractHoursSummary).toHaveBeenCalledWith(
                7,
                "support_base",
                80,
                expect.stringMatching(/^\d{4}-\d{2}$/)
            );
        });

        it("il listino dei pacchetti, nell'ordine, senza i tipi di intervento", async () => {
            const response = await request(buildApp()).get("/api/contracts/packages");

            expect(response.status).toBe(200);
            expect(response.body.map((entry: { key: string }) => entry.key)).toEqual([
                "remote_20",
                "remote_40",
                "ready_20",
                "ready_40",
                "ready_60",
                "support_base",
                "support_plus",
            ]);
            expect(response.body[0]).toEqual({
                key: "remote_20",
                name: "Assistenza Remota Pack 20",
                includedHours: 20,
                priceCents: 40000,
                period: "month",
                priority: 4,
                typology: "Teleassistenza, solo software",
            });
            expect(response.body[4]).toMatchObject({ key: "ready_60", includedHours: 60, priceCents: 123000 });
            expect(response.body[6]).toMatchObject({
                key: "support_plus",
                includedHours: 150,
                priceCents: 250000,
                period: "contract",
                priority: 1,
            });
            // Non è letto come l'id di un contratto.
            expect(getContractById).not.toHaveBeenCalled();
        });

        it("risponde 404 se il contratto non esiste", async () => {
            vi.mocked(getContractById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/contracts/999");

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Contratto non trovato");
        });

        it("lista paginata: filtri passati alla query, righe trasformate", async () => {
            vi.mocked(listContracts).mockResolvedValue({ items: [flatRow], totalItems: 1 } as never);

            const response = await request(buildApp()).get(
                "/api/contracts?page=1&pageSize=10&search=nas&sortBy=endDate&sortOrder=asc&type=assistance&status=expired&customerId=3&providerId=2"
            );

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ items: [dto], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 });
            expect(listContracts).toHaveBeenCalledWith({
                page: 1,
                pageSize: 10,
                search: "nas",
                sortBy: "endDate",
                sortOrder: "asc",
                type: "assistance",
                status: "expired",
                customerId: 3,
                providerId: 2,
                timeZone: "Europe/Rome",
            });
        });

        it("senza filtri usa type e status `all`", async () => {
            vi.mocked(listContracts).mockResolvedValue({ items: [], totalItems: 0 } as never);

            await request(buildApp()).get("/api/contracts?page=1&pageSize=10");

            expect(listContracts).toHaveBeenCalledWith(expect.objectContaining({ type: "all", status: "all" }));
        });

        it.each(["sortBy=nome", "status=scaduto", "type=altro", "customerId=0"])("rifiuta %s", async (query) => {
            const response = await request(buildApp()).get(`/api/contracts?${query}`);

            expect(response.status).toBe(400);
            expect(listContracts).not.toHaveBeenCalled();
        });
    });

    describe("stampa", () => {
        const customerRow = {
            phoneNumber: "333123456",
            phoneNumberSecondary: null,
            email: " mario@rossi.it ",
            city: "Torino",
        };
        const providerRow = {
            providerName: "Acme Srl",
            firstName: "Luca",
            lastName: "Neri",
            email: "info@acme.it",
            phoneNumber: "011222333",
            logoDataUrl: "data:image/png;base64,AAA=",
        };
        const pdfBuffer = Buffer.from("%PDF-finto");

        beforeEach(() => {
            vi.mocked(getCustomerById).mockResolvedValue([customerRow] as never);
            vi.mocked(getProviderById).mockResolvedValue([providerRow] as never);
            vi.mocked(getLabConfig).mockResolvedValue({
                labName: "Laboratorio Rossi",
                labEmail: "info@rossi.it",
                labAddress: "Via Roma 1",
                labPhone: "0123456789",
                timeZone: "Europe/Rome",
            });
            vi.mocked(createContractPdfBuffer).mockResolvedValue(pdfBuffer);
        });

        const printedData = () => vi.mocked(createContractPdfBuffer).mock.calls[0][0];

        it("risponde 404 se il contratto non esiste", async () => {
            vi.mocked(getContractById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/contracts/99/print");

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: "Contratto non trovato" });
            expect(createContractPdfBuffer).not.toHaveBeenCalled();
        });

        it("stampa il contratto di assistenza attivo con il riepilogo ore", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp()).get("/api/contracts/7/print");

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toBe("application/pdf");
            expect(response.headers["content-disposition"]).toBe("inline; filename=contratto-7.pdf");
            expect(getContractById).toHaveBeenCalledWith(7, "Europe/Rome");
            expect(getCustomerById).toHaveBeenCalledWith(3);
            expect(getProviderById).toHaveBeenCalledWith(2);
            expect(getContractHoursSummary).toHaveBeenCalledWith(
                7,
                "ready_20",
                20,
                expect.stringMatching(/^\d{4}-\d{2}$/)
            );

            expect(printedData()).toMatchObject({
                id: 7,
                kind: "contract",
                status: "active",
                providerLogoDataUrl: "data:image/png;base64,AAA=",
                billingLabel: null,
                customerName: "Mario Rossi",
                customerPhone: "333123456",
                customerEmail: "mario@rossi.it",
                customerCity: "Torino",
                providerName: "Acme Srl",
                providerContact: "Luca Neri",
                providerEmail: "info@acme.it",
                providerPhone: "011222333",
                type: "assistance",
                device: "Server NAS",
                termLabel: "12 mesi",
                startDateLabel: "1 ott 2026",
                endDateLabel: "1 ott 2027",
                note: null,
                assistance: {
                    period: "month",
                    packageName: "Pronti Via 20",
                    includedHoursLabel: "20 ore al mese",
                    priceLabel: "500,00 € al mese + IVA",
                    priorityLabel: "3",
                    typology: "Teleassistenza, on site e in laboratorio: hardware, software, formazione",
                    coveredInterventionTypes: [
                        "Intervento da remoto",
                        "Intervento in sede",
                        "Intervento in laboratorio",
                    ],
                },
                monthlyHours: [
                    { monthLabel: "ottobre 2026", usedHoursLabel: "12,5 h", usageLabel: "63%", cumulativeLabel: null },
                    { monthLabel: "settembre 2026", usedHoursLabel: "3 h", usageLabel: "15%", cumulativeLabel: null },
                ],
            });
        });

        it("un Supporto si stampa con ore in 12 mesi, prezzo unico e totale cumulato", async () => {
            vi.mocked(getContractById).mockResolvedValue([
                { ...supportRow, package: "support_plus", includedHours: 150, priceCents: 250000 },
            ] as never);

            await request(buildApp()).get("/api/contracts/7/print");

            expect(printedData()).toMatchObject({
                assistance: {
                    period: "contract",
                    packageName: "Supporto Plus",
                    includedHoursLabel: "150 ore in 12 mesi",
                    priceLabel: "2.500,00 € + IVA",
                    priorityLabel: "1 (massima)",
                },
                // Dal mese più recente; il totale di un mese comprende quelli prima.
                monthlyHours: [
                    {
                        monthLabel: "ottobre 2026",
                        usedHoursLabel: "12,5 h",
                        usageLabel: null,
                        cumulativeLabel: "15,5 h",
                    },
                    { monthLabel: "settembre 2026", usedHoursLabel: "3 h", usageLabel: null, cumulativeLabel: "3 h" },
                ],
            });
        });

        it("una bozza è un preventivo, senza riepilogo ore", async () => {
            vi.mocked(getContractById).mockResolvedValue([
                { ...flatRow, status: "draft", effectiveStatus: "draft" },
            ] as never);

            const response = await request(buildApp()).get("/api/contracts/7/print");

            expect(response.status).toBe(200);
            expect(response.headers["content-disposition"]).toBe("inline; filename=preventivo-7.pdf");
            expect(printedData()).toMatchObject({ kind: "quote", status: "draft", monthlyHours: [] });
        });

        it("il noleggio non ha assistenza e non calcola le ore", async () => {
            vi.mocked(getContractById).mockResolvedValue([rentalRow] as never);

            const response = await request(buildApp()).get("/api/contracts/8/print");

            expect(response.status).toBe(200);
            expect(getContractHoursSummary).not.toHaveBeenCalled();
            expect(printedData()).toMatchObject({
                type: "rental",
                billingLabel: "ogni 3 mesi",
                assistance: null,
                monthlyHours: [],
            });
        });

        it("senza ore registrate il riepilogo è omesso", async () => {
            vi.mocked(getContractById).mockResolvedValue([supportRow] as never);
            vi.mocked(getContractHoursSummary).mockResolvedValue({
                hours: {},
                monthlyHours: [{ month: "2026-10", usedHours: 0 }],
            } as never);

            await request(buildApp()).get("/api/contracts/7/print");

            expect(printedData()).toMatchObject({
                assistance: { includedHoursLabel: "80 ore in 12 mesi" },
                monthlyHours: [],
            });
        });

        it("un contratto annullato si stampa come contratto", async () => {
            vi.mocked(getContractById).mockResolvedValue([
                { ...flatRow, status: "cancelled", effectiveStatus: "cancelled" },
            ] as never);

            await request(buildApp()).get("/api/contracts/7/print");

            expect(printedData()).toMatchObject({ kind: "contract", status: "cancelled" });
        });
    });

    describe("creazione", () => {
        it("crea un contratto di assistenza con la sua riga e risponde 201", async () => {
            vi.mocked(createContract).mockResolvedValue({ id: 7 } as never);
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp()).post("/api/contracts").send(assistanceBody);

            expect(response.status).toBe(201);
            expect(response.body).toEqual(dto);
            expect(createContract).toHaveBeenCalledWith(
                {
                    type: "assistance",
                    termMonths: 12,
                    device: "Server NAS",
                    startDate: "2026-10-01",
                    customerId: 3,
                    providerId: 2,
                },
                // Ore e prezzo li copia il server dal listino: il corpo ha solo la chiave.
                { package: "ready_20", includedHours: 20, priceCents: 50000 }
            );
        });

        it("crea un Supporto di 12 mesi con lo snapshot del listino", async () => {
            vi.mocked(createContract).mockResolvedValue({ id: 7 } as never);
            vi.mocked(getContractById).mockResolvedValue([supportRow] as never);

            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, assistance: { package: "support_base" } });

            expect(response.status).toBe(201);
            expect(createContract).toHaveBeenCalledWith(expect.anything(), {
                package: "support_base",
                includedHours: 80,
                priceCents: 160000,
            });
        });

        it.each(["support_base", "support_plus"])("un %s con durata diversa da 12 mesi è rifiutato", async (key) => {
            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, termMonths: 24, assistance: { package: key } });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "Il pacchetto Supporto dura sempre 12 mesi",
                field: "termMonths",
            });
            expect(createContract).not.toHaveBeenCalled();
        });

        it("un pacchetto mensile accetta qualunque durata", async () => {
            vi.mocked(createContract).mockResolvedValue({ id: 7 } as never);
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, termMonths: 7, assistance: { package: "remote_40" } });

            expect(response.status).toBe(201);
            expect(createContract).toHaveBeenCalledWith(expect.anything(), {
                package: "remote_40",
                includedHours: 40,
                priceCents: 72000,
            });
        });

        it("crea un noleggio senza dati di assistenza", async () => {
            vi.mocked(createContract).mockResolvedValue({ id: 8 } as never);
            vi.mocked(getContractById).mockResolvedValue([rentalRow] as never);
            const { assistance: _assistance, ...rentalBody } = { ...assistanceBody, type: "rental", billingMonths: 3 };

            const response = await request(buildApp()).post("/api/contracts").send(rentalBody);

            expect(response.status).toBe(201);
            expect(createContract).toHaveBeenCalledWith(
                expect.objectContaining({ type: "rental", billingMonths: 3 }),
                undefined
            );
        });

        it("rifiuta un noleggio senza periodo di fatturazione", async () => {
            const { assistance: _assistance, ...rentalBody } = { ...assistanceBody, type: "rental" };

            const response = await request(buildApp()).post("/api/contracts").send(rentalBody);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Il periodo di fatturazione è obbligatorio per un noleggio");
            expect(createContract).not.toHaveBeenCalled();
        });

        it("rifiuta un'assistenza senza i suoi dati", async () => {
            const { assistance: _assistance, ...body } = assistanceBody;

            const response = await request(buildApp()).post("/api/contracts").send(body);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("I dati di assistenza sono obbligatori per un contratto di assistenza");
            expect(createContract).not.toHaveBeenCalled();
        });

        it("rifiuta un noleggio con dati di assistenza", async () => {
            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, type: "rental", billingMonths: 3 });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Solo un contratto di assistenza ha dati di assistenza");
            expect(createContract).not.toHaveBeenCalled();
        });

        it.each([
            ["un pacchetto inesistente", { package: "full_time" }],
            ["un vecchio tipo", { assistanceType: "remote" }],
            ["le ore nel corpo", { package: "ready_20", includedHours: 20 }],
            ["il prezzo nel corpo", { package: "ready_20", priceCents: 1 }],
            ["nessun pacchetto", {}],
        ])("rifiuta %s", async (_label, assistance) => {
            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, assistance });

            expect(response.status).toBe(400);
            expect(createContract).not.toHaveBeenCalled();
        });

        it.each([
            ["una data inesistente", { startDate: "2026-02-31" }],
            ["una durata a zero mesi", { termMonths: 0 }],
            ["una durata oltre i 120 mesi", { termMonths: 121 }],
            ["una durata non intera", { termMonths: 1.5 }],
            ["un periodo di fatturazione su un'assistenza", { billingMonths: 3 }],
            ["lo stato scaduto", { status: "expired" }],
            ["un dispositivo vuoto", { device: " " }],
            ["un campo sconosciuto", { price: 1 }],
        ])("rifiuta %s", async (_label, override) => {
            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, ...override });

            expect(response.status).toBe(400);
            expect(createContract).not.toHaveBeenCalled();
        });
    });

    describe("modifica", () => {
        it("aggiorna i campi del contratto senza toccare l'assistenza", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ status: "cancelled", note: "Disdetto" });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(7, { status: "cancelled", note: "Disdetto" }, undefined);
            // Il pacchetto non è cambiato: nessun motivo di azzerare gli avvisi.
            expect(resetAssistanceAlerts).not.toHaveBeenCalled();
        });

        it("cambiando il pacchetto copia ore e prezzo dal listino e azzera gli avvisi", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { package: "ready_40" } });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(
                7,
                {},
                { package: "ready_40", includedHours: 40, priceCents: 90000 }
            );
            expect(resetAssistanceAlerts).toHaveBeenCalledWith(7, expect.stringMatching(/^\d{4}-\d{2}$/));
        });

        it("lo stesso pacchetto ripetuto non riscrive ore e prezzo e non azzera gli avvisi", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { package: "ready_20" }, note: "x" });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(7, { note: "x" }, undefined);
            expect(resetAssistanceAlerts).not.toHaveBeenCalled();
        });

        it("passare a Supporto con durata 12 mesi nel corpo è accettato e fa lo snapshot", async () => {
            vi.mocked(getContractById).mockResolvedValue([{ ...flatRow, termMonths: 6 }] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ termMonths: 12, assistance: { package: "support_plus" } });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(
                7,
                { termMonths: 12 },
                { package: "support_plus", includedHours: 150, priceCents: 250000 }
            );
        });

        it("passare a Supporto con la durata salvata diversa da 12 mesi è rifiutato", async () => {
            vi.mocked(getContractById).mockResolvedValue([{ ...flatRow, termMonths: 6 }] as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { package: "support_base" } });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "Il pacchetto Supporto dura sempre 12 mesi",
                field: "termMonths",
            });
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("cambiare solo la durata di un contratto Supporto è rifiutato, 12 mesi invece va bene", async () => {
            vi.mocked(getContractById).mockResolvedValue([supportRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const refused = await request(buildApp()).put("/api/contracts/7").send({ termMonths: 6 });

            expect(refused.status).toBe(400);
            expect(refused.body).toEqual({ message: "Il pacchetto Supporto dura sempre 12 mesi", field: "termMonths" });
            expect(updateContractById).not.toHaveBeenCalled();

            const accepted = await request(buildApp()).put("/api/contracts/7").send({ termMonths: 12 });

            expect(accepted.status).toBe(200);
        });

        it("spostare la data di inizio di un Supporto azzera gli avvisi (la loro chiave è quella data)", async () => {
            vi.mocked(getContractById).mockResolvedValue([supportRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            await request(buildApp()).put("/api/contracts/7").send({ startDate: "2026-11-01" });

            expect(resetAssistanceAlerts).toHaveBeenCalledWith(7, expect.stringMatching(/^\d{4}-\d{2}$/));
        });

        it("da Supporto a un pacchetto mensile la durata può cambiare", async () => {
            vi.mocked(getContractById).mockResolvedValue([supportRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ termMonths: 6, assistance: { package: "remote_20" } });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(
                7,
                { termMonths: 6 },
                { package: "remote_20", includedHours: 20, priceCents: 40000 }
            );
        });

        it("accetta il tipo se è lo stesso, e non lo riscrive", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ type: "assistance", device: "NAS" });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(7, { device: "NAS" }, undefined);
        });

        it("rifiuta di cambiare il cliente se ci sono interventi collegati, con un messaggio sulla modifica", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(hasLinkedInterventions).mockResolvedValue(true);

            const response = await request(buildApp()).put("/api/contracts/7").send({ customerId: 4 });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                message: "Il cliente non si può cambiare: il contratto ha interventi collegati",
                field: "customerId",
            });
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("cambia il cliente se non ci sono interventi, e non controlla se il cliente è lo stesso", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);
            vi.mocked(hasLinkedInterventions).mockResolvedValue(false);

            expect((await request(buildApp()).put("/api/contracts/7").send({ customerId: 4 })).status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(7, { customerId: 4 }, undefined);

            vi.mocked(hasLinkedInterventions).mockClear();
            // Lo stesso cliente non è un cambio: niente query in più.
            expect((await request(buildApp()).put("/api/contracts/7").send({ customerId: 3 })).status).toBe(200);
            expect(hasLinkedInterventions).not.toHaveBeenCalled();
        });

        it("rifiuta di cambiare il tipo", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp()).put("/api/contracts/7").send({ type: "rental" });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Il tipo di contratto non si può cambiare");
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("rifiuta i dati di assistenza su un noleggio", async () => {
            vi.mocked(getContractById).mockResolvedValue([rentalRow] as never);

            const response = await request(buildApp())
                .put("/api/contracts/8")
                .send({ assistance: { package: "ready_20" } });

            expect(response.status).toBe(400);
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("rifiuta ore o prezzo nel corpo: li decide il listino", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { package: "ready_40", includedHours: 5 } });

            expect(response.status).toBe(400);
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("rifiuta il periodo di fatturazione su un'assistenza", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp()).put("/api/contracts/7").send({ billingMonths: 3 });

            expect(response.status).toBe(400);
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("rifiuta un update senza campi e risponde 404 su un contratto mancante", async () => {
            expect((await request(buildApp()).put("/api/contracts/7").send({})).status).toBe(400);

            vi.mocked(getContractById).mockResolvedValue([] as never);

            expect((await request(buildApp()).put("/api/contracts/9").send({ device: "x" })).status).toBe(404);
        });
    });

    describe("eliminazione", () => {
        it("elimina un contratto esistente e risponde 404 su uno mancante", async () => {
            vi.mocked(deleteContractById).mockResolvedValueOnce([{ id: 7 }] as never);
            vi.mocked(deleteContractById).mockResolvedValueOnce([] as never);

            expect((await request(buildApp()).delete("/api/contracts/7")).status).toBe(200);
            expect(removeSignedContractFile).toHaveBeenCalledWith(7);
            expect((await request(buildApp()).delete("/api/contracts/7")).status).toBe(404);
            expect(removeSignedContractFile).toHaveBeenCalledTimes(1);
        });

        it("un contratto con interventi collegati risponde 400 con il messaggio italiano", async () => {
            vi.mocked(deleteContractById).mockRejectedValue(
                Object.assign(new Error('update or delete on table "contract" violates foreign key'), {
                    code: "23503",
                    constraint: "intervention_customer_contract_fk",
                })
            );

            const response = await request(buildApp()).delete("/api/contracts/7");

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Impossibile eliminare il contratto: è ancora collegato a uno o più interventi."
            );
        });
    });

    describe("contratto firmato", () => {
        const pdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
        const signedRow = {
            contractId: 7,
            fileName: "firmato.pdf",
            sizeBytes: pdfBytes.length,
            uploadedAt: new Date("2026-11-12T09:00:00.000Z"),
        };

        it("il dettaglio riporta i dati del firmato, senza il file", async () => {
            vi.mocked(getContractById).mockResolvedValue([
                {
                    ...flatRow,
                    signedFileName: "firmato.pdf",
                    signedSizeBytes: 1234,
                    signedUploadedAt: "2026-11-12T09:00:00.000Z",
                },
            ] as never);
            vi.mocked(getContractHoursSummary).mockResolvedValue(hoursSummary as never);

            const response = await request(buildApp()).get("/api/contracts/7");

            expect(response.body.signedContract).toEqual({
                fileName: "firmato.pdf",
                sizeBytes: 1234,
                uploadedAt: "2026-11-12T09:00:00.000Z",
            });
            expect(response.body).not.toHaveProperty("signedFileName");
        });

        it("carica un PDF e risponde 201 con i suoi dati", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(saveSignedContract).mockResolvedValue({
                fileName: "Contratto firmato.pdf",
                sizeBytes: pdfBytes.length,
                uploadedAt: signedRow.uploadedAt,
            } as never);

            const response = await request(buildApp())
                .post("/api/contracts/7/signed-contract")
                .attach("file", pdfBytes, { filename: "Contratto firmato.pdf", contentType: "application/pdf" });

            expect(response.status).toBe(201);
            expect(stageSignedContractFile).toHaveBeenCalledWith(7, pdfBytes);
            expect(saveSignedContract).toHaveBeenCalledWith(7, "Contratto firmato.pdf", pdfBytes.length);
            expect(stagedFile.commit).toHaveBeenCalled();
            expect(stagedFile.discard).not.toHaveBeenCalled();
        });

        it("se la riga non si salva il file nuovo si butta e resta quello di prima", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(saveSignedContract).mockRejectedValue(new Error("connessione persa"));

            const response = await request(buildApp())
                .post("/api/contracts/7/signed-contract")
                .attach("file", pdfBytes, { filename: "firmato.pdf", contentType: "application/pdf" });

            expect(response.status).toBe(500);
            expect(stagedFile.discard).toHaveBeenCalled();
            expect(stagedFile.commit).not.toHaveBeenCalled();
        });

        it("riconosce il PDF dai byte: un file che non lo è viene rifiutato anche se si dichiara PDF", async () => {
            const response = await request(buildApp())
                .post("/api/contracts/7/signed-contract")
                .attach("file", Buffer.from("non sono un pdf"), {
                    filename: "finto.pdf",
                    contentType: "application/pdf",
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Il contratto firmato deve essere un file PDF");
            expect(stageSignedContractFile).not.toHaveBeenCalled();
            expect(saveSignedContract).not.toHaveBeenCalled();
        });

        it("senza file risponde 400", async () => {
            const response = await request(buildApp()).post("/api/contracts/7/signed-contract");

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Nessun file caricato");
        });

        it("su un contratto mancante risponde 404 senza salvare", async () => {
            vi.mocked(getContractById).mockResolvedValue([] as never);

            const response = await request(buildApp())
                .post("/api/contracts/9/signed-contract")
                .attach("file", pdfBytes, { filename: "firmato.pdf", contentType: "application/pdf" });

            expect(response.status).toBe(404);
            expect(saveSignedContract).not.toHaveBeenCalled();
        });

        it("un file oltre il limite risponde 413", async () => {
            const tooBig = Buffer.concat([pdfBytes, Buffer.alloc(15 * 1024 * 1024)]);

            const response = await request(buildApp())
                .post("/api/contracts/7/signed-contract")
                .attach("file", tooBig, { filename: "enorme.pdf", contentType: "application/pdf" });

            expect(response.status).toBe(413);
            expect(saveSignedContract).not.toHaveBeenCalled();
        });

        it("si scarica come PDF; senza firmato, o con il file sparito dal disco, risponde 404", async () => {
            vi.mocked(getSignedContract).mockResolvedValueOnce(signedRow as never);
            vi.mocked(readSignedContractFile).mockResolvedValueOnce(pdfBytes);
            vi.mocked(getSignedContract).mockResolvedValueOnce(undefined as never);
            vi.mocked(getSignedContract).mockResolvedValueOnce(signedRow as never);
            vi.mocked(readSignedContractFile).mockResolvedValueOnce(null);

            const found = await request(buildApp()).get("/api/contracts/7/signed-contract");
            const missing = await request(buildApp()).get("/api/contracts/7/signed-contract");
            const fileGone = await request(buildApp()).get("/api/contracts/7/signed-contract");

            expect(found.status).toBe(200);
            expect(found.headers["content-type"]).toBe("application/pdf");
            expect(found.headers["content-disposition"]).toBe("inline; filename=contratto-firmato-7.pdf");
            expect(Buffer.from(found.body).equals(pdfBytes)).toBe(true);
            expect(missing.status).toBe(404);
            expect(fileGone.status).toBe(404);
        });

        it("si elimina, e senza firmato risponde 404", async () => {
            vi.mocked(deleteSignedContract).mockResolvedValueOnce([{ contractId: 7 }] as never);
            vi.mocked(deleteSignedContract).mockResolvedValueOnce([] as never);

            expect((await request(buildApp()).delete("/api/contracts/7/signed-contract")).status).toBe(200);
            expect(removeSignedContractFile).toHaveBeenCalledWith(7);
            expect((await request(buildApp()).delete("/api/contracts/7/signed-contract")).status).toBe(404);
            expect(removeSignedContractFile).toHaveBeenCalledTimes(1);
        });

        describe("invio al cliente", () => {
            const labConfig = {
                labName: "Laboratorio EasyLab",
                labEmail: "info@easylab.it",
                labAddress: "Via Roma 1",
                labPhone: "011 1234567",
            };

            beforeEach(() => {
                resetEmailSendRateLimit();
                vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
                vi.mocked(getCustomerById).mockResolvedValue([{ id: 3, email: " mario@example.com " }] as never);
                vi.mocked(getSignedContract).mockResolvedValue(signedRow as never);
                vi.mocked(readSignedContractFile).mockResolvedValue(pdfBytes);
                vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
                vi.mocked(loadPrintableLogo).mockResolvedValue(null as never);
                vi.mocked(sendEmail).mockResolvedValue(undefined as never);
            });

            it("invia il firmato al cliente, con l'allegato chiamato sulla data di inizio", async () => {
                const response = await request(buildApp()).post("/api/contracts/7/send-email");

                expect(response.status).toBe(200);
                expect(response.body.message).toBe("Contratto firmato inviato a mario@example.com");
                expect(sendEmail).toHaveBeenCalledWith(
                    expect.objectContaining({
                        to: "mario@example.com",
                        replyTo: "info@easylab.it",
                        subject: "Contratto di assistenza firmato - Laboratorio EasyLab",
                        attachments: [
                            {
                                filename: "contratto-firmato-2026-10-01.pdf",
                                content: pdfBytes,
                                contentType: "application/pdf",
                            },
                        ],
                    })
                );
            });

            it("allega il logo inline quando c'è", async () => {
                vi.mocked(loadPrintableLogo).mockResolvedValue({
                    content: Buffer.from("logo-bytes"),
                    contentType: "image/png",
                } as never);

                await request(buildApp()).post("/api/contracts/7/send-email");

                const { attachments, html } = vi.mocked(sendEmail).mock.calls[0][0] as {
                    attachments: { cid?: string }[];
                    html: string;
                };
                expect(attachments[1]).toMatchObject({ cid: "logo-laboratorio", contentType: "image/png" });
                expect(html).toContain('src="cid:logo-laboratorio"');
            });

            it("senza firmato caricato risponde 400 e non invia", async () => {
                vi.mocked(getSignedContract).mockResolvedValue(undefined as never);

                const response = await request(buildApp()).post("/api/contracts/7/send-email");

                expect(response.status).toBe(400);
                expect(response.body.message).toBe("Carica il contratto firmato prima di inviarlo al cliente");
                expect(sendEmail).not.toHaveBeenCalled();
            });

            it("senza email del cliente risponde 400 e non invia", async () => {
                vi.mocked(getCustomerById).mockResolvedValue([{ id: 3, email: null }] as never);

                const response = await request(buildApp()).post("/api/contracts/7/send-email");

                expect(response.status).toBe(400);
                expect(response.body.message).toBe("Il cliente non ha un indirizzo email configurato");
                expect(sendEmail).not.toHaveBeenCalled();
            });

            it("su un contratto mancante risponde 404", async () => {
                vi.mocked(getContractById).mockResolvedValue([] as never);

                expect((await request(buildApp()).post("/api/contracts/9/send-email")).status).toBe(404);
                expect(sendEmail).not.toHaveBeenCalled();
            });

            it("oltre il tetto orario risponde 429 senza caricare il contratto", async () => {
                for (let sent = 0; sent < emailSendMaxPerWindow; sent += 1) {
                    consumeEmailSendSlot("senza-utente");
                }

                const response = await request(buildApp()).post("/api/contracts/7/send-email");

                expect(response.status).toBe(429);
                expect(getContractById).not.toHaveBeenCalled();
                expect(sendEmail).not.toHaveBeenCalled();
            });
        });
    });
});
