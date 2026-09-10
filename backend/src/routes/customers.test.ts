import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Il query layer, i servizi PDF e la config del laboratorio sono mockati: questo test
// copre routing, validazione e composizione dei dati senza Postgres né pdfmake.
vi.mock("../db/queries/customer", () => ({
    listCustomers: vi.fn(),
    getCustomerById: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomerById: vi.fn(),
    deleteCustomerById: vi.fn(),
}));

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
}));

import {
    createCustomer,
    deleteCustomerById,
    getCustomerById,
    listCustomers,
    updateCustomerById,
} from "../db/queries/customer";
import { listReports } from "../db/queries/report";
import { listInterventions } from "../db/queries/intervention";
import { createCustomerReportsPdfBuffer } from "../services/reportPdf";
import { createCustomerInterventionsPdfBuffer } from "../services/interventionPdf";
import { getLabConfig } from "../config/lab";
import customersRouter from "./customers";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/customers", customersRouter);
    app.use(errorHandler);
    return app;
};

const customer = {
    id: 5,
    firstName: "Mario",
    lastName: "Rossi",
    phoneNumber: "0212345678",
    phoneNumberSecondary: null,
    email: "mario@example.com",
    city: "Milano",
    created_at: new Date(),
    updated_at: null,
};

const labConfig = {
    labName: "Laboratorio",
    labEmail: "info@lab.it",
    labAddress: "Via Roma 1",
    labPhone: "0212345678",
    labLogoUrl: "http://localhost/assets/logo.jpg",
};

describe("customers router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
    });

    it("restituisce la lista non paginata quando mancano page/pageSize", async () => {
        vi.mocked(listCustomers).mockResolvedValue([customer] as never);

        const response = await request(buildApp()).get("/api/customers");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
    });

    it("calcola totalPages quando la lista è paginata", async () => {
        vi.mocked(listCustomers).mockResolvedValue({ items: [customer], totalItems: 15 } as never);

        const response = await request(buildApp()).get("/api/customers?page=2&pageSize=10");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ totalItems: 15, page: 2, pageSize: 10, totalPages: 2 });
    });

    it("risponde 404 quando il cliente non esiste", async () => {
        vi.mocked(getCustomerById).mockResolvedValue([] as never);

        const response = await request(buildApp()).get("/api/customers/999");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Customer not found");
    });

    it("crea un cliente e risponde 201", async () => {
        vi.mocked(createCustomer).mockResolvedValue([customer] as never);

        const response = await request(buildApp())
            .post("/api/customers")
            .send({ firstName: "Mario", phoneNumber: "0212345678" });

        expect(response.status).toBe(201);
        expect(createCustomer).toHaveBeenCalledWith({ firstName: "Mario", phoneNumber: "0212345678" });
    });

    it("rifiuta la creazione con firstName vuoto", async () => {
        const response = await request(buildApp())
            .post("/api/customers")
            .send({ firstName: "   ", phoneNumber: "0212345678" });

        expect(response.status).toBe(400);
        expect(createCustomer).not.toHaveBeenCalled();
    });

    // Un cliente senza nessun recapito telefonico non è raggiungibile: la scheda cliente
    // si basa sull'avere almeno un numero, non è solo un vincolo di comodo del form.
    it("rifiuta la creazione senza nessun numero di telefono", async () => {
        const response = await request(buildApp()).post("/api/customers").send({ firstName: "Mario" });

        expect(response.status).toBe(400);
        expect(createCustomer).not.toHaveBeenCalled();
    });

    it("rifiuta la creazione con un campo sconosciuto", async () => {
        const response = await request(buildApp())
            .post("/api/customers")
            .send({ firstName: "Mario", phoneNumber: "0212345678", nickname: "Mari" });

        expect(response.status).toBe(400);
        expect(createCustomer).not.toHaveBeenCalled();
    });

    it("aggiorna un cliente esistente", async () => {
        vi.mocked(updateCustomerById).mockResolvedValue([customer] as never);

        const response = await request(buildApp()).put("/api/customers/5").send({ city: "Roma" });

        expect(response.status).toBe(200);
        expect(updateCustomerById).toHaveBeenCalledWith(5, { city: "Roma" });
    });

    it("rifiuta un update senza campi", async () => {
        const response = await request(buildApp()).put("/api/customers/5").send({});

        expect(response.status).toBe(400);
        expect(updateCustomerById).not.toHaveBeenCalled();
    });

    // Stesso vincolo della creazione, ma sull'update va ricontrollato esplicitamente:
    // qui i campi sono opzionali, quindi azzerare entrambi i numeri passerebbe altrimenti.
    it("rifiuta un update che azzera entrambi i numeri di telefono", async () => {
        const response = await request(buildApp())
            .put("/api/customers/5")
            .send({ phoneNumber: null, phoneNumberSecondary: null });

        expect(response.status).toBe(400);
        expect(updateCustomerById).not.toHaveBeenCalled();
    });

    it("risponde 404 sull'update di un id inesistente", async () => {
        vi.mocked(updateCustomerById).mockResolvedValue([] as never);

        const response = await request(buildApp()).put("/api/customers/999").send({ city: "Roma" });

        expect(response.status).toBe(404);
    });

    it("elimina un cliente esistente", async () => {
        vi.mocked(deleteCustomerById).mockResolvedValue([customer] as never);

        const response = await request(buildApp()).delete("/api/customers/5");

        expect(response.status).toBe(200);
        expect(deleteCustomerById).toHaveBeenCalledWith(5);
    });

    it("risponde 404 sulla cancellazione di un id inesistente", async () => {
        vi.mocked(deleteCustomerById).mockResolvedValue([] as never);

        const response = await request(buildApp()).delete("/api/customers/999");

        expect(response.status).toBe(404);
    });

    it("propaga la violazione di FK all'errorHandler come 400", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(deleteCustomerById).mockRejectedValue(
            Object.assign(new Error('update or delete on table "customer" violates foreign key constraint'), {
                code: "23503",
                constraint: "report_customer_id_customer_id_fk",
            })
        );

        const response = await request(buildApp()).delete("/api/customers/5");

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Impossibile eliminare il cliente");
    });

    describe("stampa PDF report del cliente", () => {
        it("risponde 404 quando il cliente non esiste", async () => {
            vi.mocked(getCustomerById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/customers/999/reports/print");

            expect(response.status).toBe(404);
            expect(listReports).not.toHaveBeenCalled();
        });

        it("rifiuta un intervallo di date mal formattato", async () => {
            const response = await request(buildApp()).get("/api/customers/5/reports/print?dateFrom=not-a-date");

            expect(response.status).toBe(400);
            expect(getCustomerById).not.toHaveBeenCalled();
        });

        it("genera il PDF passando intestazione, intervallo e report mappati", async () => {
            vi.mocked(getCustomerById).mockResolvedValue([customer] as never);
            vi.mocked(listReports).mockResolvedValue([
                {
                    id: 42,
                    createdAt: new Date("2026-01-15"),
                    device: "iPhone 12",
                    issue: "Schermo rotto",
                    closed: true,
                    alerted: false,
                    paymentMethod: "cash",
                    totalPrice: 8000,
                },
            ] as never);
            vi.mocked(createCustomerReportsPdfBuffer).mockResolvedValue(Buffer.from("pdf") as never);

            const response = await request(buildApp()).get(
                "/api/customers/5/reports/print?dateFrom=2026-01-01&dateTo=2026-01-31"
            );

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("application/pdf");
            expect(response.headers["content-disposition"]).toContain("customer-5-reports.pdf");
            expect(listReports).toHaveBeenCalledWith({ customerId: 5, dateFrom: "2026-01-01", dateTo: "2026-01-31" });
            expect(createCustomerReportsPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    customerId: 5,
                    customerName: "Mario Rossi",
                    reportCount: 1,
                    rangeLabel: expect.stringContaining("2026"),
                    reports: [
                        expect.objectContaining({
                            id: 42,
                            deviceName: "iPhone 12",
                            issueDescription: "Schermo rotto",
                            closed: true,
                            paymentMethod: "cash",
                            totalPrice: 8000,
                        }),
                    ],
                })
            );
        });

        // listReports torna items+totalItems solo quando gli arrivano page/pageSize: la
        // stampa non li passa mai, ma il ramo va comunque coperto perché la funzione è
        // condivisa con le rotte paginate.
        it("gestisce anche un risultato paginato di listReports", async () => {
            vi.mocked(getCustomerById).mockResolvedValue([customer] as never);
            vi.mocked(listReports).mockResolvedValue({ items: [], totalItems: 0 } as never);
            vi.mocked(createCustomerReportsPdfBuffer).mockResolvedValue(Buffer.from("pdf") as never);

            const response = await request(buildApp()).get("/api/customers/5/reports/print");

            expect(response.status).toBe(200);
            expect(createCustomerReportsPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({ reportCount: 0, reports: [] })
            );
        });
    });

    describe("stampa PDF interventi del cliente", () => {
        it("risponde 404 quando il cliente non esiste", async () => {
            vi.mocked(getCustomerById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/customers/999/interventions/print");

            expect(response.status).toBe(404);
            expect(listInterventions).not.toHaveBeenCalled();
        });

        it("genera il PDF passando intestazione e interventi mappati", async () => {
            vi.mocked(getCustomerById).mockResolvedValue([customer] as never);
            vi.mocked(listInterventions).mockResolvedValue([
                {
                    id: 7,
                    createdAt: new Date("2026-02-01"),
                    type: "intervento_sede",
                    status: "completato",
                    description: "Sostituzione batteria",
                    interventionDate: "2026-02-05",
                    startTime: "09:00:00",
                    endTime: "10:00:00",
                },
            ] as never);
            vi.mocked(createCustomerInterventionsPdfBuffer).mockResolvedValue(Buffer.from("pdf") as never);

            const response = await request(buildApp()).get("/api/customers/5/interventions/print");

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("application/pdf");
            expect(response.headers["content-disposition"]).toContain("customer-5-interventions.pdf");
            expect(listInterventions).toHaveBeenCalledWith({ customerId: 5, dateFrom: undefined, dateTo: undefined });
            expect(createCustomerInterventionsPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    customerId: 5,
                    interventionCount: 1,
                    interventions: [
                        expect.objectContaining({
                            id: 7,
                            type: "intervento_sede",
                            status: "completato",
                            description: "Sostituzione batteria",
                            scheduleLabel: expect.stringContaining("09:00-10:00"),
                        }),
                    ],
                })
            );
        });
    });
});
