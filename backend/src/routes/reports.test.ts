import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Come negli altri test di rotta: il query layer è mockato, così la CI non ha bisogno di
// un Postgres attivo. Il filtro `collaboratorId` sulla lista è già coperto da
// `collaboratorFilter.test.ts` e non viene ripetuto qui.
vi.mock("../db/queries/report", () => ({
    listReports: vi.fn(),
    getReportById: vi.fn(),
    createReport: vi.fn(),
    updateReportById: vi.fn(),
    deleteReportById: vi.fn(),
    getReportStats: vi.fn(),
}));

// `/:id/print` interroga `db` direttamente (join su cliente, dispositivo, difetto e prezzo
// tecnico), senza passare dal query layer: va mockato a parte con un costruttore
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
}));

vi.mock("../services/reportPdf", () => ({
    createReportPdfBuffer: vi.fn(),
}));

import {
    createReport,
    deleteReportById,
    getReportById,
    getReportStats,
    listReports,
    updateReportById,
} from "../db/queries/report";
import { db } from "../db";
import { getLabConfig } from "../config/lab";
import { createReportPdfBuffer } from "../services/reportPdf";
import reportsRouter from "./reports";
import { errorHandler } from "../middleware/errorHandler";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/reports", reportsRouter);
    app.use(errorHandler);
    return app;
};

const labConfig = {
    labName: "EasyLab",
    labEmail: "info@easylab.it",
    labAddress: "Via Roma 1",
    labPhone: "02 1234567",
    labLogoUrl: "https://example.test/logo.png",
};

// Riga così come la restituisce la query congiunta di `/:id/print`.
const printReportRow = {
    id: 1,
    note: "Richiamare per ritiro",
    password: "1234",
    issueDescription: "Schermo incrinato sull'angolo",
    issueLabel: "Schermo rotto",
    dataBackup: true,
    charger: false,
    alerted: true,
    price: 50,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    customerFirstName: "Mario",
    customerLastName: "Rossi",
    customerPhone: "02 1234567",
    customerPhoneSecondary: null,
    deviceName: "iPhone 12",
};

// Riga così come la restituisce `getReportById`/`updateReportById`: colonne grezze della
// tabella, non quelle rinominate della query di stampa.
const storedReport = {
    id: 1,
    note: null,
    password: null,
    issueDescription: null,
    serviceDescription: null,
    dataBackup: false,
    charger: false,
    alerted: false,
    closed: false,
    paymentMethod: "non_paid",
    price: 0,
    created_at: new Date("2026-01-01T10:00:00Z"),
    updated_at: null,
    deviceId: 1,
    issueId: 1,
    collaboratorId: null,
    customerId: 1,
};

describe("reports router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("GET /", () => {
        it("senza page/pageSize la visibilità di default è 'all'", async () => {
            vi.mocked(listReports).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp()).get("/api/reports");

            expect(response.status).toBe(200);
            expect(vi.mocked(listReports).mock.calls[0][0]).toMatchObject({ visibility: "all" });
        });

        // La scheda cliente/collaboratore chiede la pagina 1 senza dire "aperti": deve
        // vedere comunque solo quelli, non l'intero storico.
        it("con page/pageSize la visibilità di default diventa 'open'", async () => {
            vi.mocked(listReports).mockResolvedValue({ items: [], totalItems: 0 } as never);

            const response = await request(buildApp()).get("/api/reports?page=1&pageSize=10");

            expect(response.status).toBe(200);
            expect(vi.mocked(listReports).mock.calls[0][0]).toMatchObject({ visibility: "open" });
        });

        it("una visibilità esplicita ha sempre la precedenza sul default", async () => {
            vi.mocked(listReports).mockResolvedValue({ items: [], totalItems: 0 } as never);

            await request(buildApp()).get("/api/reports?page=1&pageSize=10&visibility=closed");

            expect(vi.mocked(listReports).mock.calls[0][0]).toMatchObject({ visibility: "closed" });
        });

        it("inoltra l'intervallo di date alla query", async () => {
            vi.mocked(listReports).mockResolvedValue([] as never);

            await request(buildApp()).get("/api/reports?dateFrom=2026-01-01&dateTo=2026-01-31");

            expect(vi.mocked(listReports).mock.calls[0][0]).toMatchObject({
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
            });
        });

        it("rifiuta un sortBy fuori dall'insieme consentito per questa rotta", async () => {
            const response = await request(buildApp()).get("/api/reports?sortBy=deviceName");

            expect(response.status).toBe(400);
            expect(listReports).not.toHaveBeenCalled();
        });
    });

    describe("GET /stats", () => {
        it("senza mese passa undefined alla query", async () => {
            vi.mocked(getReportStats).mockResolvedValue({
                openCount: 1,
                closedCount: 2,
                monthlyRevenue: 100,
                series: [],
            } as never);

            const response = await request(buildApp()).get("/api/reports/stats");

            expect(response.status).toBe(200);
            expect(getReportStats).toHaveBeenCalledWith(undefined);
        });

        it("inoltra il mese richiesto", async () => {
            vi.mocked(getReportStats).mockResolvedValue({
                openCount: 0,
                closedCount: 0,
                monthlyRevenue: 0,
                series: [],
            } as never);

            await request(buildApp()).get("/api/reports/stats?month=2026-03");

            expect(getReportStats).toHaveBeenCalledWith("2026-03");
        });

        it("rifiuta un mese in un formato non valido", async () => {
            const response = await request(buildApp()).get("/api/reports/stats?month=2026-3");

            expect(response.status).toBe(400);
            expect(getReportStats).not.toHaveBeenCalled();
        });
    });

    describe("GET /:id/print", () => {
        it("risponde 404 quando il report non esiste", async () => {
            // Le due select del `Promise.all` partono entrambe prima del controllo sulla
            // prima: vanno mockate tutte e due anche quando conta solo l'assenza del report.
            vi.mocked(db.select)
                .mockReturnValueOnce(queryResult([]) as never)
                .mockReturnValueOnce(queryResult([{ technicianPrice: 0 }]) as never);

            const response = await request(buildApp()).get("/api/reports/999/print");

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Report not found");
            expect(createReportPdfBuffer).not.toHaveBeenCalled();
        });

        it("somma il compenso del tecnico al prezzo interno e usa il problema scritto a mano", async () => {
            vi.mocked(db.select)
                .mockReturnValueOnce(queryResult([printReportRow]) as never)
                .mockReturnValueOnce(queryResult([{ technicianPrice: 20 }]) as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
            vi.mocked(createReportPdfBuffer).mockResolvedValue(Buffer.from("pdf-bytes") as never);

            const response = await request(buildApp()).get("/api/reports/1/print");

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("application/pdf");
            expect(response.headers["content-disposition"]).toBe("inline; filename=report-1.pdf");
            expect(createReportPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 1,
                    customerName: "Mario Rossi",
                    customerPhone: "02 1234567",
                    deviceName: "iPhone 12",
                    issueDescription: "Schermo incrinato sull'angolo",
                    totalPrice: 70,
                    createdAtLabel: "1 gen 2026",
                    ...labConfig,
                })
            );
        });

        it("usa l'etichetta del difetto quando manca il problema scritto a mano", async () => {
            vi.mocked(db.select)
                .mockReturnValueOnce(queryResult([{ ...printReportRow, issueDescription: null }]) as never)
                .mockReturnValueOnce(queryResult([{ technicianPrice: 0 }]) as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
            vi.mocked(createReportPdfBuffer).mockResolvedValue(Buffer.from("pdf-bytes") as never);

            await request(buildApp()).get("/api/reports/1/print");

            expect(createReportPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({ issueDescription: "Schermo rotto", totalPrice: 50 })
            );
        });
    });

    describe("GET /:id", () => {
        it("risponde 404 quando il report non esiste", async () => {
            vi.mocked(getReportById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/reports/999");

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Report not found");
        });

        it("restituisce il report trovato", async () => {
            vi.mocked(getReportById).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp()).get("/api/reports/1");

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(1);
        });
    });

    describe("POST /", () => {
        const minimalBody = { deviceId: 1, issueId: 1, customerId: 1 };

        it("crea un report non pagato con i default", async () => {
            vi.mocked(createReport).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp()).post("/api/reports").send(minimalBody);

            expect(response.status).toBe(201);
            expect(createReport).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "non_paid", price: 0 }));
        });

        it("rifiuta di chiudere un report senza indicare un collaboratore", async () => {
            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, closed: true });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Per chiudere un report è necessario indicare un collaboratore");
            expect(createReport).not.toHaveBeenCalled();
        });

        it("rifiuta un pagamento in contanti con prezzo a zero", async () => {
            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, paymentMethod: "cash", price: 0 });

            expect(response.status).toBe(400);
            expect(createReport).not.toHaveBeenCalled();
        });

        it("accetta un pagamento con carta con prezzo maggiore di zero", async () => {
            vi.mocked(createReport).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, paymentMethod: "card", price: 50 });

            expect(response.status).toBe(201);
        });

        it("chiude un report quando indica il collaboratore", async () => {
            vi.mocked(createReport).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, closed: true, collaboratorId: 3 });

            expect(response.status).toBe(201);
            expect(createReport).toHaveBeenCalledWith(expect.objectContaining({ closed: true, collaboratorId: 3 }));
        });

        it("rifiuta un campo non previsto dallo schema", async () => {
            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, extra: "non dovrebbe esserci" });

            expect(response.status).toBe(400);
            expect(createReport).not.toHaveBeenCalled();
        });
    });

    describe("PUT /:id", () => {
        it("rifiuta un corpo senza campi", async () => {
            const response = await request(buildApp()).put("/api/reports/1").send({});

            expect(response.status).toBe(400);
            expect(updateReportById).not.toHaveBeenCalled();
        });

        it("risponde 404 quando il report non esiste", async () => {
            vi.mocked(getReportById).mockResolvedValue([] as never);

            const response = await request(buildApp()).put("/api/reports/999").send({ note: "Nuova nota" });

            expect(response.status).toBe(404);
        });

        it("aggiorna un campo mantenendo il resto della riga esistente", async () => {
            vi.mocked(getReportById).mockResolvedValue([storedReport] as never);
            vi.mocked(updateReportById).mockResolvedValue([{ ...storedReport, note: "Richiamare" }] as never);

            const response = await request(buildApp()).put("/api/reports/1").send({ note: "Richiamare" });

            expect(response.status).toBe(200);
            expect(updateReportById).toHaveBeenCalledWith(1, { note: "Richiamare" });
        });

        // Il pagamento resta "cash" perché non viene toccato dal corpo: solo il prezzo
        // arriva a zero, e la combinazione risultante va comunque rifiutata.
        it("rifiuta un prezzo a zero quando il metodo di pagamento esistente è già 'cash'", async () => {
            vi.mocked(getReportById).mockResolvedValue([
                { ...storedReport, paymentMethod: "cash", price: 50 },
            ] as never);

            const response = await request(buildApp()).put("/api/reports/1").send({ price: 0 });

            expect(response.status).toBe(400);
            expect(updateReportById).not.toHaveBeenCalled();
        });

        it("rifiuta di chiudere un report la cui riga esistente non ha un collaboratore", async () => {
            vi.mocked(getReportById).mockResolvedValue([{ ...storedReport, collaboratorId: null }] as never);

            const response = await request(buildApp()).put("/api/reports/1").send({ closed: true });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Per chiudere un report è necessario indicare un collaboratore");
            expect(updateReportById).not.toHaveBeenCalled();
        });

        // `collaboratorId: null` è un valore esplicito ("svuota il campo"), non l'assenza
        // del campo: deve contare come tale anche se il report resta chiuso da prima.
        it("rifiuta di svuotare il collaboratore di un report già chiuso", async () => {
            vi.mocked(getReportById).mockResolvedValue([{ ...storedReport, closed: true, collaboratorId: 3 }] as never);

            const response = await request(buildApp()).put("/api/reports/1").send({ collaboratorId: null });

            expect(response.status).toBe(400);
            expect(updateReportById).not.toHaveBeenCalled();
        });

        it("risponde 404 se la riga sparisce fra il controllo e l'aggiornamento", async () => {
            vi.mocked(getReportById).mockResolvedValue([storedReport] as never);
            vi.mocked(updateReportById).mockResolvedValue([] as never);

            const response = await request(buildApp()).put("/api/reports/1").send({ note: "Nuova nota" });

            expect(response.status).toBe(404);
        });
    });

    describe("DELETE /:id", () => {
        it("elimina un report esistente", async () => {
            vi.mocked(deleteReportById).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp()).delete("/api/reports/1");

            expect(response.status).toBe(200);
            expect(deleteReportById).toHaveBeenCalledWith(1);
        });

        it("risponde 404 quando il report non esiste", async () => {
            vi.mocked(deleteReportById).mockResolvedValue([] as never);

            const response = await request(buildApp()).delete("/api/reports/999");

            expect(response.status).toBe(404);
        });

        it("propaga la violazione di FK sul cliente come 400", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            vi.mocked(deleteReportById).mockRejectedValue(
                Object.assign(new Error('update or delete on table "customer" violates foreign key constraint'), {
                    code: "23503",
                    constraint: "report_customer_id_customer_id_fk",
                })
            );

            const response = await request(buildApp()).delete("/api/reports/1");

            expect(response.status).toBe(400);
            expect(response.body.message).toContain("Impossibile eliminare il cliente");
        });
    });
});
