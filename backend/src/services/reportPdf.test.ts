import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Come in interventionPdf.test.ts: pdfmake viene mockato del tutto, l'unica cosa che
 * conta e' la document definition che i generatori costruiscono. `createReportPdfBuffer`
 * in particolare chiama `createPdf` più volte per misurare quanto contenuto entra in
 * pagina (vedi `planReceiptLayout` in reportPdf.ts). Con l'impaginazione mockata l'hook di
 * misura (`pageBreakBefore`) non scatta da solo: `reportEndsAt` lo fa scattare dove serve al
 * test, e senza di lui ogni misura dice "non entra nel foglio". L'impaginazione vera sta in
 * `reportPdf.render.test.ts`.
 */
// `vi.mock` viene issato in cima al file: le funzioni finte devono nascere dentro
// `vi.hoisted`, altrimenti la fabbrica le referenzia prima che esistano.
const { createPdf, addFonts } = vi.hoisted(() => ({ createPdf: vi.fn(), addFonts: vi.fn() }));

vi.mock("pdfmake", () => ({
    default: { addFonts, createPdf, setUrlAccessPolicy: vi.fn(), setLocalAccessPolicy: vi.fn() },
}));

const { loadLogoDataUrl } = vi.hoisted(() => ({
    loadLogoDataUrl: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("./pdf/shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./pdf/shared")>();
    return { ...actual, loadLogoDataUrl };
});

import { pdfStyles } from "./pdf/shared";
import {
    createCustomerReportsPdfBuffer,
    createReportPdfBuffer,
    type CustomerReportSummaryItem,
    type CustomerReportsPrintData,
    type ReportPrintData,
} from "./reportPdf";

const fakeBuffer = Buffer.from("finto-pdf");

type MeasurableDoc = {
    content: { id?: string }[];
    pageBreakBefore: (node: { id?: string; startPosition?: { top: number; pageNumber: number } }) => boolean;
};

/**
 * Fa "finire" il contenuto a `top` punti dall'alto della prima pagina in ogni passata di misura,
 * come farebbe pdfmake chiamando l'hook sulla sentinella.
 */
const reportEndsAt = (top: number) => {
    createPdf.mockImplementation((doc: MeasurableDoc) => {
        const sentinel = doc.content.find((node) => node?.id === "reportContentEnd");

        if (sentinel) {
            doc.pageBreakBefore({ ...sentinel, startPosition: { top, pageNumber: 1 } });
        }

        return { getBuffer: vi.fn().mockResolvedValue(fakeBuffer) };
    });
};

/** Il corpo dei valori nella definizione: quello del nome del cliente, che è sempre un valore. */
const customerNameFontSize = (doc: Record<string, unknown>, customerName: string) => {
    let fontSize: number | undefined;

    JSON.stringify(doc, (_key, value: unknown) => {
        const cell = value as { text?: unknown; style?: unknown; fontSize?: number } | null;

        if (cell && typeof cell === "object" && cell.text === customerName && cell.style === "value") {
            fontSize = cell.fontSize;
        }

        return value;
    });

    return fontSize;
};

beforeEach(() => {
    vi.clearAllMocks();
    loadLogoDataUrl.mockResolvedValue(null);
    createPdf.mockImplementation(() => ({ getBuffer: vi.fn().mockResolvedValue(fakeBuffer) }));
});

const buildReport = (overrides: Partial<ReportPrintData> = {}): ReportPrintData => ({
    id: 77,
    labName: "Laboratorio Rossi",
    labEmail: "info@rossi.it",
    labAddress: "Via Roma 1",
    labPhone: "0123456789",
    customerName: "Mario Bianchi",
    customerPhone: "333123456",
    deviceName: "iPhone 13",
    issueDescription: "Schermo rotto",
    serviceDescription: null,
    note: "Cliente disponibile solo la mattina",
    password: "1234",
    dataBackup: false,
    charger: false,
    alerted: false,
    totalPrice: 120,
    createdAtLabel: "10/09/2026",
    ...overrides,
});

const buildCustomerReports = (overrides: Partial<CustomerReportsPrintData> = {}): CustomerReportsPrintData => ({
    customerId: 5,
    customerName: "Mario Bianchi",
    customerPhone: "333123456",
    customerEmail: "mario@bianchi.it",
    labName: "Laboratorio Rossi",
    labEmail: "info@rossi.it",
    labAddress: "Via Roma 1",
    labPhone: "0123456789",
    reportCount: 1,
    reports: [],
    ...overrides,
});

const buildReportSummary = (overrides: Partial<CustomerReportSummaryItem> = {}): CustomerReportSummaryItem => ({
    id: 11,
    createdAtLabel: "01/01/2026",
    deviceName: "iPhone 13",
    issueDescription: "Schermo rotto",
    closed: false,
    alerted: false,
    paymentMethod: "non_paid",
    totalPrice: 80,
    ...overrides,
});

const formatEuroLikeTheService = (value: number) =>
    new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);

/** Rigenera il PDF e restituisce SOLO la definizione finale (l'ultima chiamata a createPdf). */
const captureFinalReportDoc = async (report: ReportPrintData) => {
    createPdf.mockClear();
    await createReportPdfBuffer(report);
    const calls = createPdf.mock.calls;
    return calls[calls.length - 1][0] as Record<string, unknown>;
};

const captureCustomerReportsDoc = async (customer: CustomerReportsPrintData) => {
    createPdf.mockClear();
    await createCustomerReportsPdfBuffer(customer);
    return createPdf.mock.calls[0][0] as Record<string, unknown>;
};

describe("createReportPdfBuffer", () => {
    it("carica il logo del laboratorio e risolve nel buffer prodotto da pdfmake", async () => {
        loadLogoDataUrl.mockResolvedValue("data:image/png;base64,AAA=");

        const result = await createReportPdfBuffer(buildReport());

        expect(result).toBe(fakeBuffer);
        expect(loadLogoDataUrl).toHaveBeenCalledTimes(1);
    });

    it("impagina due volte: una passata di misura e la definizione finale, entrambe A4 con gli stili condivisi", async () => {
        reportEndsAt(700);
        createPdf.mockClear();
        await createReportPdfBuffer(buildReport());

        // Prima erano tre: la seconda misura (la "sonda" sul padding) è diventata una costante.
        expect(createPdf).toHaveBeenCalledTimes(2);
        for (const [doc] of createPdf.mock.calls) {
            expect((doc as Record<string, unknown>).pageSize).toBe("A4");
            expect((doc as Record<string, unknown>).styles).toBe(pdfStyles);
        }
    });

    it("solo la passata di misura porta il nodo sentinella di fine contenuto", async () => {
        reportEndsAt(700);
        createPdf.mockClear();
        await createReportPdfBuffer(buildReport());

        const [misurazione, finale] = createPdf.mock.calls.map(([doc]) => JSON.stringify(doc));

        expect(misurazione).toContain("reportContentEnd");
        expect(finale).not.toContain("reportContentEnd");
    });

    it("lo spazio che avanza in fondo va sul padding, al costo fisso per punto", async () => {
        // 100 punti liberi meno uno di margine: 99 / 54 = 1,83 punti di padding in più, sotto il tetto.
        reportEndsAt(841.89 - 14 - 100);
        const doc = await captureFinalReportDoc(buildReport());
        const layout = (doc.content as { layout?: { paddingTop?: () => number } }[]).find(
            (node) => node.layout?.paddingTop
        )!.layout!;

        expect(layout.paddingTop!()).toBeCloseTo(2.5 + 99 / 54, 5);
    });

    it("se il testo non entra in un foglio lo riduce a gradini, e si ferma al primo che entra", async () => {
        let passes = 0;
        createPdf.mockImplementation((doc: MeasurableDoc) => {
            const sentinel = doc.content.find((node) => node?.id === "reportContentEnd");

            // Le prime tre misure sbordano: righe a mano alte, poi basse al corpo pieno, poi a 10,5.
            if (sentinel) {
                passes += 1;
                doc.pageBreakBefore({ ...sentinel, startPosition: { top: 50, pageNumber: passes <= 3 ? 2 : 1 } });
            }

            return { getBuffer: vi.fn().mockResolvedValue(fakeBuffer) };
        });

        const report = buildReport();
        const doc = await captureFinalReportDoc(report);

        expect(passes).toBe(4);
        expect(customerNameFontSize(doc, report.customerName)).toBe(9.5);
    });

    it("se non entra nemmeno al corpo più piccolo stampa comunque, al minimo", async () => {
        const report = buildReport();
        const doc = await captureFinalReportDoc(report);

        // Cinque misure (tutte "non entra") e il PDF finale.
        expect(createPdf).toHaveBeenCalledTimes(6);
        expect(customerNameFontSize(doc, report.customerName)).toBe(8.5);
    });

    it("la definizione finale contiene i dati del cliente, del dispositivo e l'importo formattato in euro", async () => {
        const report = buildReport({ totalPrice: 45.5 });
        const serialized = JSON.stringify(await captureFinalReportDoc(report));

        expect(serialized).toContain(report.customerName);
        expect(serialized).toContain(report.deviceName);
        expect(serialized).toContain(`Report #${report.id}`);
        expect(serialized).toContain(formatEuroLikeTheService(45.5));
    });

    it("valorizza il riquadro AVVISATO solo quando il report lo segnala, senza toccare le altre spunte", async () => {
        // dataBackup e charger restano false in entrambi i casi: l'unico "Si" possibile
        // nel documento e' quello del riquadro AVVISATO, che compare una sola volta
        // (non e' duplicato come le altre sezioni stampate due volte sul foglio).
        const nonAvvisato = JSON.stringify(await captureFinalReportDoc(buildReport({ alerted: false })));
        const avvisato = JSON.stringify(await captureFinalReportDoc(buildReport({ alerted: true })));

        const countSi = (json: string) => (json.match(/"text":"Si"/g) ?? []).length;

        expect(countSi(nonAvvisato)).toBe(0);
        expect(countSi(avvisato)).toBe(1);
    });
});

describe("createCustomerReportsPdfBuffer", () => {
    it("carica il logo del laboratorio e risolve nel buffer prodotto da pdfmake", async () => {
        const result = await createCustomerReportsPdfBuffer(buildCustomerReports());

        expect(result).toBe(fakeBuffer);
        expect(loadLogoDataUrl).toHaveBeenCalledTimes(1);
        expect(createPdf).toHaveBeenCalledTimes(1);
    });

    it("include il nome del cliente e il conteggio report nell'intestazione", async () => {
        const customer = buildCustomerReports({ reportCount: 4 });
        const serialized = JSON.stringify(await captureCustomerReportsDoc(customer));

        expect(serialized).toContain(customer.customerName);
        expect(serialized).toContain("4 report");
    });

    it("senza report mostra il messaggio di elenco vuoto e nessun totale", async () => {
        const serialized = JSON.stringify(await captureCustomerReportsDoc(buildCustomerReports({ reports: [] })));

        expect(serialized).toContain("Nessun report disponibile");
        expect(serialized).not.toContain("Totale complessivo");
    });

    it("con report elenca stato, metodo di pagamento e il totale complessivo", async () => {
        const serialized = JSON.stringify(
            await captureCustomerReportsDoc(
                buildCustomerReports({
                    reports: [
                        buildReportSummary({ closed: true, paymentMethod: "cash", totalPrice: 30 }),
                        buildReportSummary({ closed: false, paymentMethod: "card", totalPrice: 20 }),
                    ],
                })
            )
        );

        expect(serialized).toContain("Chiuso");
        expect(serialized).toContain("Aperto");
        expect(serialized).toContain("Contanti");
        expect(serialized).toContain("Carta");
        expect(serialized).toContain("Totale complessivo");
        expect(serialized).toContain(formatEuroLikeTheService(50));
    });
});
