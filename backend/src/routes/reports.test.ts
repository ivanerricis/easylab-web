import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Come negli altri test di rotta: il query layer è mockato, così la CI non ha bisogno di
// un Postgres attivo. Il filtro `collaboratorId` sulla lista è già coperto da
// `collaboratorFilter.test.ts` e non viene ripetuto qui.
vi.mock("../db/queries/report", () => ({
    listReports: vi.fn(),
    getReportById: vi.fn(),
    getReportDetailById: vi.fn(),
    createReport: vi.fn(),
    updateReportById: vi.fn(),
    deleteReportById: vi.fn(),
    getReportStats: vi.fn(),
}));

// La regola D5 ("Altro" ⇒ descrizione non vuota) guarda l'etichetta del difetto scelto: la
// rotta la legge con `getIssueById`, mockata qui come le altre query.
vi.mock("../db/queries/issue", () => ({
    getIssueById: vi.fn(),
}));

vi.mock("../config/lab", () => ({
    getLabConfig: vi.fn(),
    getAppTimeZone: vi.fn(async () => "Europe/Rome"),
}));

vi.mock("../services/reportPdf", () => ({
    createReportPdfBuffer: vi.fn(),
}));

import {
    createReport,
    deleteReportById,
    getReportById,
    getReportDetailById,
    getReportStats,
    listReports,
    updateReportById,
} from "../db/queries/report";
import { getIssueById } from "../db/queries/issue";
import { getLabConfig } from "../config/lab";
import { createReportPdfBuffer } from "../services/reportPdf";
import reportsRouter from "./reports";
import { errorHandler } from "../middleware/errorHandler";
import { ExportTooLargeError, exportRowLimit } from "../db/queries/pagination";

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
    timeZone: "Europe/Rome",
};

// Quello che finisce nell'intestazione del PDF: il fuso serve solo a scrivere le date.
const { timeZone: _timeZone, ...labHeader } = labConfig;

// Riga così come la restituisce `getReportDetailById`, che serve anche la stampa.
const printReportRow = {
    id: 1,
    note: "Richiamare per ritiro",
    password: "1234",
    issueDescription: "Schermo incrinato sull'angolo",
    serviceDescription: "Sostituito display",
    issueName: "Schermo rotto",
    // Il problema come lo calcola ormai la query (`issueTextExpr` in `db/queries/report.ts`):
    // la rotta si limita a passarlo al PDF, non lo ricalcola più in JS.
    issueText: "Schermo incrinato sull'angolo",
    dataBackup: true,
    charger: false,
    alerted: true,
    price: 50,
    created_at: new Date("2026-01-01T10:00:00Z"),
    customerName: "Mario Rossi",
    customerPhoneNumber: "02 1234567",
    customerPhoneSecondary: null,
    deviceName: "iPhone 12",
    technicianPrice: 20,
    // Stessa cosa per il totale (`totalPriceExpr`): prima la rotta faceva
    // `report.price + Number(report.technicianPrice)`.
    totalPrice: 70,
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

/**
 * Come farebbe Postgres per davvero (vedi migration 0035_report_domain_checks, verificata contro
 * il database di sviluppo): `code` 23514 e il nome del vincolo violato su `constraint`. Il query
 * layer qui sotto è mockato, quindi questi test provano che la rotta lascia propagare l'errore a
 * `errorHandler`, che lo traduce nello stesso messaggio italiano che la rotta dava prima a mano —
 * non che Postgres si comporti così: quello lo prova `report.db.test.ts`, contro un database vero.
 */
const checkViolationError = (constraint: string) =>
    Object.assign(new Error(`new row for relation "report" violates check constraint "${constraint}"`), {
        code: "23514",
        constraint,
    });

describe("reports router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Difetto qualunque, non "Altro": i test che non riguardano la regola D5 non devono
        // preoccuparsi di mockare anche questo. I test di quella regola sovrascrivono.
        vi.mocked(getIssueById).mockResolvedValue([{ id: 1, description: "Schermo rotto" }] as never);
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

    describe("GET /export.csv", () => {
        // Riga così come la restituisce `listReports` non paginato: colonne già leggibili
        // (nome cliente, dispositivo...), non quelle grezze della tabella.
        const exportReportRow = {
            id: 1,
            customer: "Mario Rossi",
            customerPhone: "02 1234567",
            device: "iPhone 12",
            issue: "Schermo rotto",
            issueDescription: "Schermo incrinato",
            serviceDescription: "Sostituito display",
            // Il collaboratore che ha in carico il report e il tecnico esterno vero: prima
            // questa riga simulava `technician: "-"` (il campo si chiamava così ma era il
            // collaboratore) e un `internalPrice` duplicato di `price` — vedi D4 nel CHANGELOG.
            collaborator: "Luigi Bianchi",
            technicianName: "Enzo Tecnico",
            price: 50,
            technicianPrice: 20,
            totalPrice: 70,
            paymentMethod: "cash",
            closed: true,
            note: "Richiamare",
            password: "1234",
            createdAt: new Date("2026-01-01T10:00:00Z"),
            updatedAt: null,
        };

        it("esporta con i filtri passati, le colonne di collaboratore/tecnico e le etichette italiane del pagamento", async () => {
            vi.mocked(listReports).mockResolvedValue([exportReportRow] as never);

            const response = await request(buildApp()).get(
                "/api/reports/export.csv?visibility=closed&dateFrom=2026-01-01&dateTo=2026-01-31"
            );

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toContain("text/csv");
            expect(response.headers["content-disposition"]).toContain("report.csv");
            expect(vi.mocked(listReports).mock.calls[0][0]).toMatchObject({
                visibility: "closed",
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                unpaginatedLimit: exportRowLimit,
            });
            expect(response.text).toContain("Metodo di pagamento");
            expect(response.text).toContain("Contanti");

            // Colonne per nome, non solo per contenuto: verifica anche l'ordine, così un
            // futuro riordino delle colonne farebbe fallire il test invece di passare per caso.
            const [headerLine, dataLine] = response.text.trim().split("\r\n");
            const withoutBom = headerLine.charCodeAt(0) === 0xfeff ? headerLine.slice(1) : headerLine;
            const headers = withoutBom.split(";");
            const values = dataLine.split(";");
            const columnValue = (header: string) => values[headers.indexOf(header)];

            expect(columnValue("Collaboratore")).toBe("Luigi Bianchi");
            expect(columnValue("Tecnico esterno")).toBe("Enzo Tecnico");
            // "Prezzo interno" legge `price` direttamente, non più un `internalPrice`
            // duplicato: prezzo interno, compenso tecnico e totale restano tre colonne distinte.
            expect(columnValue("Prezzo interno")).toBe("50");
            expect(columnValue("Compenso tecnico")).toBe("20");
            expect(columnValue("Prezzo totale")).toBe("70");
        });

        it("senza filtri la visibilità di default è 'all', a differenza della lista paginata", async () => {
            vi.mocked(listReports).mockResolvedValue({ items: [exportReportRow], totalItems: 1 } as never);

            const response = await request(buildApp()).get("/api/reports/export.csv");

            expect(response.status).toBe(200);
            expect(vi.mocked(listReports).mock.calls[0][0]).toMatchObject({ visibility: "all" });
        });

        /** Un file troncato sembrerebbe completo: meglio un errore che chieda di restringere i filtri. */
        it("oltre il tetto dell'export risponde 400 con il messaggio della query, senza file", async () => {
            vi.mocked(listReports).mockRejectedValue(new ExportTooLargeError("L'esportazione supera il tetto", 400));

            const response = await request(buildApp()).get("/api/reports/export.csv");

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("L'esportazione supera il tetto");
            expect(response.headers["content-type"]).not.toContain("text/csv");
        });

        it("rifiuta un sortBy fuori dall'insieme consentito, come la lista", async () => {
            const response = await request(buildApp()).get("/api/reports/export.csv?sortBy=deviceName");

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
            expect(getReportStats).toHaveBeenCalledWith(undefined, "Europe/Rome");
        });

        it("inoltra il mese richiesto", async () => {
            vi.mocked(getReportStats).mockResolvedValue({
                openCount: 0,
                closedCount: 0,
                monthlyRevenue: 0,
                series: [],
            } as never);

            await request(buildApp()).get("/api/reports/stats?month=2026-03");

            expect(getReportStats).toHaveBeenCalledWith("2026-03", "Europe/Rome");
        });

        it("rifiuta un mese in un formato non valido", async () => {
            const response = await request(buildApp()).get("/api/reports/stats?month=2026-3");

            expect(response.status).toBe(400);
            expect(getReportStats).not.toHaveBeenCalled();
        });
    });

    describe("GET /:id/print", () => {
        it("risponde 404 quando il report non esiste", async () => {
            vi.mocked(getReportDetailById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/reports/999/print");

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Report non trovato");
            expect(createReportPdfBuffer).not.toHaveBeenCalled();
        });

        it("passa al PDF il problema e il totale così come li calcola la query", async () => {
            vi.mocked(getReportDetailById).mockResolvedValue([printReportRow] as never);
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
                    serviceDescription: "Sostituito display",
                    totalPrice: 70,
                    createdAtLabel: "1 gen 2026",
                    ...labHeader,
                })
            );
        });

        // La regola "problema scritto a mano se c'è, altrimenti l'etichetta del difetto" ormai
        // è SQL (`issueTextExpr` in `db/queries/report.ts`, coperta da `report.db.test.ts`
        // contro un database vero): qui si prova solo che la rotta passa `issueText` al PDF
        // senza ricalcolarlo, qualunque valore la query gli dia.
        it("passa al PDF l'etichetta del difetto quando la query non ha un problema scritto a mano", async () => {
            vi.mocked(getReportDetailById).mockResolvedValue([
                {
                    ...printReportRow,
                    issueDescription: null,
                    issueText: "Schermo rotto",
                    technicianPrice: 0,
                    totalPrice: 50,
                },
            ] as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
            vi.mocked(createReportPdfBuffer).mockResolvedValue(Buffer.from("pdf-bytes") as never);

            await request(buildApp()).get("/api/reports/1/print");

            expect(createReportPdfBuffer).toHaveBeenCalledWith(
                expect.objectContaining({ issueDescription: "Schermo rotto", totalPrice: 50 })
            );
        });

        // La ricevuta va al cliente: il tecnico esterno è un fatto interno del laboratorio. Il suo
        // compenso entra solo nel totale, e la query di dettaglio porta con sé nome e id del tecnico.
        it("non passa al PDF niente del tecnico esterno oltre al totale", async () => {
            vi.mocked(getReportDetailById).mockResolvedValue([
                { ...printReportRow, technicianId: 12, technicianName: "Luca Verdi" },
            ] as never);
            vi.mocked(getLabConfig).mockResolvedValue(labConfig as never);
            vi.mocked(createReportPdfBuffer).mockResolvedValue(Buffer.from("pdf-bytes") as never);

            await request(buildApp()).get("/api/reports/1/print");

            const [pdfData] = vi.mocked(createReportPdfBuffer).mock.calls[0];
            expect(Object.keys(pdfData).filter((key) => /technician/i.test(key))).toEqual([]);
            expect(JSON.stringify(pdfData)).not.toContain("Luca Verdi");
        });
    });

    describe("GET /:id", () => {
        it("risponde 404 quando il report non esiste", async () => {
            vi.mocked(getReportDetailById).mockResolvedValue([] as never);

            const response = await request(buildApp()).get("/api/reports/999");

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Report non trovato");
        });

        /**
         * Il report arriva con i nomi e con il suo tecnico: la pagina di dettaglio non scarica più i
         * cataloghi interi, e il dialogo di modifica non deve perdere il tecnico. Se il campo del
         * tecnico sparisse, il dialogo mostrerebbe "Nessuno" e al salvataggio cancellerebbe
         * l'abbinamento esistente.
         */
        it("restituisce il report con i nomi e il tecnico, così come li dà la query", async () => {
            const detail = {
                ...storedReport,
                customerName: "Mario Rossi",
                customerPhone: "02 1234567",
                deviceName: "iPhone 12",
                issueName: "Schermo rotto",
                collaboratorName: null,
                technicianId: 12,
                technicianPrice: 110,
                technicianName: "Luca Verdi",
            };
            vi.mocked(getReportDetailById).mockResolvedValue([detail] as never);

            const response = await request(buildApp()).get("/api/reports/1");

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: 1,
                customerName: "Mario Rossi",
                deviceName: "iPhone 12",
                technicianId: 12,
                technicianPrice: 110,
                technicianName: "Luca Verdi",
            });
            expect(getReportDetailById).toHaveBeenCalledWith(1);
        });
    });

    describe("POST /", () => {
        const minimalBody = { deviceId: 1, issueId: 1, customerId: 1 };

        it("crea un report non pagato con i default", async () => {
            vi.mocked(createReport).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp()).post("/api/reports").send(minimalBody);

            expect(response.status).toBe(201);
            // Nessun tecnico nel corpo: il secondo argomento resta vuoto e la riga del tecnico non si tocca.
            expect(createReport).toHaveBeenCalledWith(
                expect.objectContaining({ paymentMethod: "non_paid", price: 0 }),
                undefined
            );
        });

        // D5: il difetto catch-all "Altro" (vedi `issueCatalog.ts`) richiede una descrizione
        // scritta a mano, altrimenti la ricevuta e il resoconto mostrerebbero solo l'etichetta
        // "Altro", che da sola non dice niente. Il `beforeEach` mocka `getIssueById` con un
        // difetto qualunque; questi test lo sovrascrivono con quello catch-all.
        it("rifiuta il difetto 'Altro' senza descrizione del problema", async () => {
            vi.mocked(getIssueById).mockResolvedValue([{ id: 9, description: "Altro" }] as never);

            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, issueId: 9 });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Con il difetto "Altro" va descritto il problema');
            expect(createReport).not.toHaveBeenCalled();
        });

        it("accetta il difetto 'Altro' con una descrizione del problema", async () => {
            vi.mocked(getIssueById).mockResolvedValue([{ id: 9, description: "Altro" }] as never);
            vi.mocked(createReport).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, issueId: 9, issueDescription: "Non si accende più" });

            expect(response.status).toBe(201);
        });

        it("non applica la regola del catch-all a un difetto qualunque", async () => {
            vi.mocked(createReport).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp()).post("/api/reports").send(minimalBody);

            expect(response.status).toBe(201);
        });

        it("crea il report e il suo tecnico esterno in un colpo solo", async () => {
            vi.mocked(createReport).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, technicianId: 12, technicianPrice: 30 });

            expect(response.status).toBe(201);
            const [reportFields, technician] = vi.mocked(createReport).mock.calls[0];
            expect(reportFields).not.toHaveProperty("technicianId");
            expect(reportFields).not.toHaveProperty("technicianPrice");
            expect(technician).toEqual({ technicianId: 12, price: 30 });
        });

        it("rifiuta un compenso del tecnico senza il tecnico", async () => {
            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, technicianPrice: 30 });

            expect(response.status).toBe(400);
            expect(createReport).not.toHaveBeenCalled();
        });

        // Le due regole di dominio (pagato ⇒ prezzo, chiuso ⇒ collaboratore) non sono più
        // controllate qui: le applica il CHECK del database (migration
        // 0035_report_domain_checks), e la rotta si limita a lasciar propagare l'errore a
        // `errorHandler`, che lo traduce. Vedi `checkViolationError` qui sopra.
        it("propaga la chiusura senza collaboratore come 400 col messaggio tradotto dal CHECK", async () => {
            vi.mocked(createReport).mockRejectedValue(checkViolationError("report_closed_collaborator_check"));

            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, closed: true });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Per chiudere un report è necessario indicare un collaboratore");
        });

        it("propaga un pagamento in contanti con prezzo a zero come 400 col messaggio tradotto dal CHECK", async () => {
            vi.mocked(createReport).mockRejectedValue(checkViolationError("report_paid_price_check"));

            const response = await request(buildApp())
                .post("/api/reports")
                .send({ ...minimalBody, paymentMethod: "cash", price: 0 });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0"
            );
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
            expect(createReport).toHaveBeenCalledWith(
                expect.objectContaining({ closed: true, collaboratorId: 3 }),
                undefined
            );
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
            // Stesso testo delle altre anagrafiche (D6, BE-B): prima qui c'era l'inglese
            // "At least one field is required".
            expect(response.body.message).toBe("È necessario specificare almeno un campo");
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
            expect(updateReportById).toHaveBeenCalledWith(1, { note: "Richiamare" }, undefined);
        });

        // D5, sulla riga *risultante* della PUT (unione del corpo parziale con quella esistente,
        // letta da `getReportById`): stesso messaggio della POST, stessa funzione di validazione.
        describe("difetto catch-all 'Altro'", () => {
            it("rifiuta il passaggio ad 'Altro' se la riga esistente non ha già una descrizione", async () => {
                vi.mocked(getReportById).mockResolvedValue([storedReport] as never);
                vi.mocked(getIssueById).mockResolvedValue([{ id: 9, description: "Altro" }] as never);

                const response = await request(buildApp()).put("/api/reports/1").send({ issueId: 9 });

                expect(response.status).toBe(400);
                expect(response.body.message).toBe('Con il difetto "Altro" va descritto il problema');
                expect(updateReportById).not.toHaveBeenCalled();
            });

            it("accetta il passaggio ad 'Altro' se il corpo porta anche la descrizione", async () => {
                vi.mocked(getReportById).mockResolvedValue([storedReport] as never);
                vi.mocked(getIssueById).mockResolvedValue([{ id: 9, description: "Altro" }] as never);
                vi.mocked(updateReportById).mockResolvedValue([storedReport] as never);

                const response = await request(buildApp())
                    .put("/api/reports/1")
                    .send({ issueId: 9, issueDescription: "Non carica più" });

                expect(response.status).toBe(200);
            });

            it("rifiuta lo svuotamento della descrizione se il difetto esistente è già 'Altro'", async () => {
                vi.mocked(getReportById).mockResolvedValue([
                    { ...storedReport, issueId: 9, issueDescription: "Non si accende" },
                ] as never);
                vi.mocked(getIssueById).mockResolvedValue([{ id: 9, description: "Altro" }] as never);

                const response = await request(buildApp()).put("/api/reports/1").send({ issueDescription: null });

                expect(response.status).toBe(400);
                expect(response.body.message).toBe('Con il difetto "Altro" va descritto il problema');
                expect(updateReportById).not.toHaveBeenCalled();
            });

            it("non tocca la descrizione se il corpo non la cambia e il difetto resta 'Altro'", async () => {
                vi.mocked(getReportById).mockResolvedValue([
                    { ...storedReport, issueId: 9, issueDescription: "Non si accende" },
                ] as never);
                vi.mocked(getIssueById).mockResolvedValue([{ id: 9, description: "Altro" }] as never);
                vi.mocked(updateReportById).mockResolvedValue([storedReport] as never);

                const response = await request(buildApp()).put("/api/reports/1").send({ note: "Richiamare" });

                expect(response.status).toBe(200);
            });
        });

        /**
         * Il tecnico viaggia con il report nella stessa richiesta. Prima era una risorsa a parte e
         * ogni pagina decideva da sé se aggiungerlo, aggiornarlo, sostituirlo o toglierlo.
         */
        it.each([
            [
                "assegna o sostituisce il tecnico",
                { technicianId: 12, technicianPrice: 30 },
                { technicianId: 12, price: 30 },
            ],
            [
                "toglie il tecnico con null, azzerando il compenso",
                { technicianId: null, technicianPrice: 30 },
                { technicianId: null, price: 0 },
            ],
            ["senza compenso lo considera zero", { technicianId: 12 }, { technicianId: 12, price: 0 }],
        ])("%s", async (_label, body, expectedTechnician) => {
            vi.mocked(getReportById).mockResolvedValue([storedReport] as never);
            vi.mocked(updateReportById).mockResolvedValue([storedReport] as never);

            const response = await request(buildApp()).put("/api/reports/1").send(body);

            expect(response.status).toBe(200);
            expect(updateReportById).toHaveBeenCalledWith(1, {}, expectedTechnician);
        });

        // Il pagamento resta "cash" perché non viene toccato dal corpo: solo il prezzo
        // arriva a zero, e la combinazione risultante va comunque rifiutata. Come per la POST,
        // il controllo non è più qui: è il CHECK del database (migration
        // 0035_report_domain_checks) a rifiutare l'UPDATE sulla riga risultante, ed
        // `errorHandler` traduce l'errore. `checkViolationError` è definita sopra la describe
        // principale.
        it("propaga un prezzo a zero col metodo di pagamento esistente già 'cash' come 400 tradotto dal CHECK", async () => {
            vi.mocked(getReportById).mockResolvedValue([
                { ...storedReport, paymentMethod: "cash", price: 50 },
            ] as never);
            vi.mocked(updateReportById).mockRejectedValue(checkViolationError("report_paid_price_check"));

            const response = await request(buildApp()).put("/api/reports/1").send({ price: 0 });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(
                "Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0"
            );
        });

        it("propaga la chiusura di un report la cui riga esistente non ha un collaboratore come 400 tradotto dal CHECK", async () => {
            vi.mocked(getReportById).mockResolvedValue([{ ...storedReport, collaboratorId: null }] as never);
            vi.mocked(updateReportById).mockRejectedValue(checkViolationError("report_closed_collaborator_check"));

            const response = await request(buildApp()).put("/api/reports/1").send({ closed: true });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Per chiudere un report è necessario indicare un collaboratore");
        });

        // `collaboratorId: null` è un valore esplicito ("svuota il campo"), non l'assenza del
        // campo: deve contare come tale anche se il report resta chiuso da prima. La rotta
        // manda comunque l'UPDATE (non calcola più a mano la combinazione risultante): è il
        // CHECK del database a vederla e rifiutarla, perché per Postgres la riga finale ha
        // `closed = true` e `collaborator_id = NULL`.
        it("propaga lo svuotamento del collaboratore di un report già chiuso come 400 tradotto dal CHECK", async () => {
            vi.mocked(getReportById).mockResolvedValue([{ ...storedReport, closed: true, collaboratorId: 3 }] as never);
            vi.mocked(updateReportById).mockRejectedValue(checkViolationError("report_closed_collaborator_check"));

            const response = await request(buildApp()).put("/api/reports/1").send({ collaboratorId: null });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Per chiudere un report è necessario indicare un collaboratore");
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
