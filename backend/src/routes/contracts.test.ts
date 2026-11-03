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
}));

// Le ore (query sugli interventi e avvisi) sono coperte da `services/assistanceHours.db.test.ts`.
vi.mock("../services/assistanceHours", async (importOriginal) => ({
    // `consumingInterventionTypes` è la tabella vera: serve a tradurre gli interventi coperti.
    ...(await importOriginal<typeof import("../services/assistanceHours")>()),
    getContractHoursSummary: vi.fn(),
    recheckAssistanceHours: vi.fn(),
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
    getContractById,
    hasLinkedInterventions,
    listContracts,
    updateContractById,
} from "../db/queries/contract";
import { getCustomerById } from "../db/queries/customer";
import { getProviderById } from "../db/queries/provider";
import { getLabConfig } from "../config/lab";
import { getContractHoursSummary, recheckAssistanceHours } from "../services/assistanceHours";
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
    term: "months_12",
    device: "Server NAS",
    note: null,
    startDate: "2026-10-01",
    endDate: "2027-10-01",
    customerId: 3,
    customerName: "Mario Rossi",
    providerId: 2,
    providerName: "Acme Srl",
    assistanceType: "on_site",
    includedHours: 20,
    created_at: "2026-10-01T08:00:00.000Z",
    updated_at: null,
};

const dto = {
    id: 7,
    type: "assistance",
    status: "active",
    effectiveStatus: "active",
    term: "months_12",
    device: "Server NAS",
    note: null,
    startDate: "2026-10-01",
    endDate: "2027-10-01",
    customerId: 3,
    customerName: "Mario Rossi",
    providerId: 2,
    providerName: "Acme Srl",
    assistance: { assistanceType: "on_site", includedHours: 20 },
    created_at: "2026-10-01T08:00:00.000Z",
    updated_at: null,
};

const rentalRow = { ...flatRow, id: 8, type: "rental", assistanceType: null, includedHours: null };

const assistanceBody = {
    type: "assistance",
    term: "months_12",
    device: "Server NAS",
    startDate: "2026-10-01",
    customerId: 3,
    providerId: 2,
    assistance: { assistanceType: "on_site", includedHours: 20 },
};

const hoursSummary = {
    hours: { month: "2026-10", usedHours: 12.5, includedHours: 20, remainingHours: 7.5 },
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
            expect(getContractHoursSummary).toHaveBeenCalledWith(7, 20, expect.stringMatching(/^\d{4}-\d{2}$/));
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
            expect(response.body).not.toHaveProperty("assistanceType");
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
            expect(getContractHoursSummary).toHaveBeenCalledWith(7, 20, expect.stringMatching(/^\d{4}-\d{2}$/));

            expect(printedData()).toMatchObject({
                id: 7,
                kind: "contract",
                status: "active",
                labName: "Laboratorio Rossi",
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
                    assistanceTypeLabel: "In sede o in laboratorio",
                    includedHoursLabel: "20 h al mese",
                    coveredInterventionTypes: ["Intervento in sede", "Intervento in laboratorio"],
                },
                monthlyHours: [
                    { monthLabel: "ottobre 2026", usedHoursLabel: "12,5 h", usageLabel: "63%" },
                    { monthLabel: "settembre 2026", usedHoursLabel: "3 h", usageLabel: "15%" },
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
            expect(printedData()).toMatchObject({ type: "rental", assistance: null, monthlyHours: [] });
        });

        it("senza ore registrate il riepilogo è omesso e il full time mostra ore illimitate", async () => {
            vi.mocked(getContractById).mockResolvedValue([
                { ...flatRow, assistanceType: "full_time", includedHours: null },
            ] as never);
            vi.mocked(getContractHoursSummary).mockResolvedValue({
                hours: {},
                monthlyHours: [{ month: "2026-10", usedHours: 0 }],
            } as never);

            await request(buildApp()).get("/api/contracts/7/print");

            expect(printedData()).toMatchObject({
                assistance: { includedHoursLabel: "Ore illimitate" },
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
                    term: "months_12",
                    device: "Server NAS",
                    startDate: "2026-10-01",
                    customerId: 3,
                    providerId: 2,
                },
                { assistanceType: "on_site", includedHours: 20 }
            );
        });

        it("crea un noleggio senza dati di assistenza", async () => {
            vi.mocked(createContract).mockResolvedValue({ id: 8 } as never);
            vi.mocked(getContractById).mockResolvedValue([rentalRow] as never);
            const { assistance: _assistance, ...rentalBody } = { ...assistanceBody, type: "rental" };

            const response = await request(buildApp()).post("/api/contracts").send(rentalBody);

            expect(response.status).toBe(201);
            expect(createContract).toHaveBeenCalledWith(expect.objectContaining({ type: "rental" }), undefined);
        });

        it("tempo pieno: le ore sono NULL anche se omesse", async () => {
            vi.mocked(createContract).mockResolvedValue({ id: 7 } as never);
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, assistance: { assistanceType: "full_time" } });

            expect(response.status).toBe(201);
            expect(createContract).toHaveBeenCalledWith(expect.anything(), {
                assistanceType: "full_time",
                includedHours: null,
            });
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
                .send({ ...assistanceBody, type: "rental" });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Solo un contratto di assistenza ha dati di assistenza");
            expect(createContract).not.toHaveBeenCalled();
        });

        it.each([
            ["remote", 30],
            ["remote", null],
            ["on_site", 5],
            ["complete", 10],
            ["full_time", 100],
        ])("rifiuta il pacchetto %s con %s ore", async (assistanceType, includedHours) => {
            const response = await request(buildApp())
                .post("/api/contracts")
                .send({ ...assistanceBody, assistance: { assistanceType, includedHours } });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Pacchetto di ore non valido per questo tipo di assistenza");
            expect(createContract).not.toHaveBeenCalled();
        });

        it.each([
            ["una data inesistente", { startDate: "2026-02-31" }],
            ["un termine sconosciuto", { term: "months_9" }],
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
            // Il pacchetto non è cambiato: nessun motivo di ricalcolare gli avvisi.
            expect(recheckAssistanceHours).not.toHaveBeenCalled();
        });

        it("cambiando il pacchetto ricalcola gli avvisi del mese corrente", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { includedHours: 30 } });

            expect(response.status).toBe(200);
            expect(recheckAssistanceHours).toHaveBeenCalledWith([
                { contractId: 7, month: expect.stringMatching(/^\d{4}-\d{2}$/) },
            ]);
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
                .send({ assistance: { includedHours: 10 } });

            expect(response.status).toBe(400);
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("valida il pacchetto sull'unione con i dati attuali", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);

            // on_site: passare a 5 ore non è un pacchetto on_site.
            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { includedHours: 5 } });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Pacchetto di ore non valido per questo tipo di assistenza");
            expect(updateContractById).not.toHaveBeenCalled();
        });

        it("aggiorna le ore dentro il pacchetto", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { includedHours: 30 } });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(7, {}, { assistanceType: "on_site", includedHours: 30 });
        });

        it("passando a tempo pieno le ore diventano illimitate", async () => {
            vi.mocked(getContractById).mockResolvedValue([flatRow] as never);
            vi.mocked(updateContractById).mockResolvedValue({ id: 7 } as never);

            const response = await request(buildApp())
                .put("/api/contracts/7")
                .send({ assistance: { assistanceType: "full_time" } });

            expect(response.status).toBe(200);
            expect(updateContractById).toHaveBeenCalledWith(
                7,
                {},
                { assistanceType: "full_time", includedHours: null }
            );
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
            expect((await request(buildApp()).delete("/api/contracts/7")).status).toBe(404);
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
});
