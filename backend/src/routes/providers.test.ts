import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../db/queries/provider", () => ({
    listProviders: vi.fn(),
    getProviderById: vi.fn(),
    createProvider: vi.fn(),
    updateProviderById: vi.fn(),
    deleteProviderById: vi.fn(),
}));
// Contratti, PDF e config del laboratorio mockati, come in `customers.test.ts`.
vi.mock("../db/queries/contract", () => ({
    listContracts: vi.fn(),
}));
vi.mock("../services/contractPdf", () => ({
    createCustomerContractsPdfBuffer: vi.fn(),
}));
vi.mock("../config/lab", () => ({
    getLabConfig: vi.fn(async () => ({ labName: "Lab", labEmail: "lab@x.it", labAddress: "Via 1", labPhone: "01" })),
    getAppTimeZone: vi.fn(async () => "Europe/Rome"),
}));

import {
    createProvider,
    deleteProviderById,
    getProviderById,
    listProviders,
    updateProviderById,
} from "../db/queries/provider";
import { listContracts } from "../db/queries/contract";
import { createCustomerContractsPdfBuffer } from "../services/contractPdf";
import providersRouter from "./providers";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/providers", providersRouter);
    app.use(errorHandler);
    return app;
};

const provider = {
    id: 1,
    providerName: "Acme Srl",
    firstName: null,
    lastName: null,
    email: "info@acme.it",
    phoneNumber: "0212345678",
};

const logoDataUrl = "data:image/png;base64,iVBORw0KGgo=";
const validBody = { providerName: "Acme Srl", email: "info@acme.it", phoneNumber: "0212345678", logoDataUrl };

describe("providers router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("risponde 404 quando il fornitore non esiste", async () => {
        vi.mocked(getProviderById).mockResolvedValue([] as never);

        const response = await request(buildApp()).get("/api/providers/999");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Fornitore non trovato");
    });

    it("lista paginata con ordinamento e ricerca passati alla query", async () => {
        vi.mocked(listProviders).mockResolvedValue({ items: [provider], totalItems: 1 } as never);

        const response = await request(buildApp()).get(
            "/api/providers?page=1&pageSize=10&search=acme&sortBy=createdAt&sortOrder=desc"
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ items: [provider], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 });
        expect(listProviders).toHaveBeenCalledWith({
            page: 1,
            pageSize: 10,
            search: "acme",
            sortBy: "createdAt",
            sortOrder: "desc",
        });
    });

    it("crea un fornitore e risponde 201", async () => {
        vi.mocked(createProvider).mockResolvedValue([provider] as never);

        const response = await request(buildApp()).post("/api/providers").send(validBody);

        expect(response.status).toBe(201);
        expect(createProvider).toHaveBeenCalledWith(validBody);
    });

    it.each([
        ["senza nome", { ...validBody, providerName: "  " }],
        ["senza email", { providerName: "Acme", phoneNumber: "1", logoDataUrl }],
        ["senza logo", { providerName: "Acme", email: "info@acme.it", phoneNumber: "1" }],
        ["con un logo che non è un'immagine", { ...validBody, logoDataUrl: "data:text/html;base64,AAAA" }],
        ["con un logo troppo grande", { ...validBody, logoDataUrl: "data:image/png;base64," + "A".repeat(90_000) }],
        ["con email non valida", { ...validBody, email: "non-una-email" }],
        ["senza telefono", { providerName: "Acme", email: "a@b.it" }],
        ["con un campo sconosciuto", { ...validBody, vatNumber: "1" }],
    ])("rifiuta la creazione %s", async (_label, body) => {
        const response = await request(buildApp()).post("/api/providers").send(body);

        expect(response.status).toBe(400);
        expect(createProvider).not.toHaveBeenCalled();
    });

    it("rifiuta un update senza campi", async () => {
        const response = await request(buildApp()).put("/api/providers/1").send({});

        expect(response.status).toBe(400);
        expect(updateProviderById).not.toHaveBeenCalled();
    });

    it("aggiorna solo i campi inviati", async () => {
        vi.mocked(updateProviderById).mockResolvedValue([provider] as never);

        const response = await request(buildApp()).put("/api/providers/1").send({ phoneNumber: "3331234567" });

        expect(response.status).toBe(200);
        expect(updateProviderById).toHaveBeenCalledWith(1, { phoneNumber: "3331234567" });
    });

    it("elimina un fornitore esistente e risponde 404 su uno mancante", async () => {
        vi.mocked(deleteProviderById).mockResolvedValueOnce([provider] as never);
        vi.mocked(deleteProviderById).mockResolvedValueOnce([] as never);

        expect((await request(buildApp()).delete("/api/providers/1")).status).toBe(200);
        expect((await request(buildApp()).delete("/api/providers/1")).status).toBe(404);
    });

    it("traduce un'email duplicata in 409 con il messaggio italiano", async () => {
        vi.mocked(createProvider).mockRejectedValue(
            Object.assign(new Error("duplicate"), { code: "23505", constraint: "provider_email_unique" })
        );

        const response = await request(buildApp()).post("/api/providers").send(validBody);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Esiste già un fornitore con questa email.");
    });

    describe("stampa PDF contratti del fornitore", () => {
        it("risponde 404 quando il fornitore non esiste", async () => {
            vi.mocked(getProviderById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/providers/999/contracts/print");

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: "Fornitore non trovato" });
            expect(listContracts).not.toHaveBeenCalled();
        });

        it("genera il PDF con i contratti del fornitore dal più recente, con il cliente di ognuno", async () => {
            vi.mocked(getProviderById).mockResolvedValue([
                { ...provider, firstName: "Anna", lastName: "Neri", logoDataUrl: "data:image/png;base64,TE9HTw==" },
            ] as never);
            vi.mocked(listContracts).mockResolvedValue([
                {
                    id: 2,
                    type: "assistance",
                    effectiveStatus: "active",
                    providerName: "Acme Srl",
                    customerName: "Mario Rossi",
                    device: "NAS",
                    package: "ready_20",
                    includedHours: 20,
                    priceCents: 50000,
                    startDate: "2026-10-01",
                    endDate: "2027-10-01",
                },
                {
                    id: 7,
                    type: "rental",
                    effectiveStatus: "draft",
                    providerName: "Acme Srl",
                    customerName: "Luca Verdi",
                    device: "Notebook",
                    package: null,
                    includedHours: null,
                    priceCents: null,
                    startDate: "2026-11-01",
                    endDate: "2027-05-01",
                },
            ] as never);
            vi.mocked(createCustomerContractsPdfBuffer).mockResolvedValue(Buffer.from("pdf") as never);

            const response = await request(buildApp()).get("/api/providers/1/contracts/print");

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("application/pdf");
            expect(response.headers["content-disposition"]).toBe("inline; filename=contratti-fornitore-1.pdf");
            expect(listContracts).toHaveBeenCalledWith({ providerId: 1, timeZone: "Europe/Rome" });
            expect(createCustomerContractsPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    customerId: 1,
                    customerName: "Acme Srl (Anna Neri)",
                    customerEmail: "info@acme.it",
                    subjectLabel: "Fornitore",
                    logoDataUrl: "data:image/png;base64,TE9HTw==",
                    labName: "Lab",
                    contractCount: 2,
                    contracts: [
                        expect.objectContaining({ id: 7, customerName: "Luca Verdi", assistance: null }),
                        expect.objectContaining({ id: 2, customerName: "Mario Rossi", status: "active" }),
                    ],
                })
            );
        });
    });
});
