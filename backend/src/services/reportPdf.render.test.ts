import pdfmake from "pdfmake";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Qui pdfmake è quello vero, a differenza di `reportPdf.test.ts`. L'algoritmo che fa riempire
 * alla ricevuta esattamente un foglio (misura, sonda sul padding, ridistribuzione dello spazio
 * avanzato) lavora sulle posizioni che solo un'impaginazione reale produce: con pdfmake finto
 * l'hook di misura non scatta mai e quel codice non viene eseguito.
 *
 * Ogni ricevuta costa tre impaginazioni da circa mezzo secondo l'una, da qui il timeout.
 */
vi.setConfig({ testTimeout: 30_000 });

vi.mock("./pdf/shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./pdf/shared")>();
    return { ...actual, loadLogoDataUrl: () => Promise.resolve(null) };
});

import { createReportPdfBuffer, type ReportPrintData } from "./reportPdf";

type DocumentDefinition = { content: unknown[] };

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

/** Le pagine del PDF: ogni pagina è un oggetto `/Type /Page` (il contenitore è `/Pages`). */
const countPages = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;

/**
 * Il foglio è pieno se non ci stanno nemmeno pochi punti in più: la stessa definizione con
 * uno spazio aggiunto in coda deve aprire una seconda pagina.
 */
const pagesWithExtraSpace = async (definition: DocumentDefinition, extraPoints: number) => {
    const pdf = await pdfmake
        .createPdf({
            ...definition,
            content: [...definition.content, { text: " ", fontSize: 1, margin: [0, extraPoints, 0, 0] }],
        } as never)
        .getBuffer();

    return countPages(pdf);
};

let createPdf: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    createPdf = vi.spyOn(pdfmake, "createPdf");
});

afterEach(() => {
    createPdf.mockRestore();
});

/** La definizione dell'ultima impaginazione, cioè quella del PDF consegnato. */
const finalDefinition = () => createPdf.mock.calls.at(-1)![0] as DocumentDefinition;

describe("createReportPdfBuffer con l'impaginazione vera", () => {
    it.each([
        ["con i dati essenziali", buildReport()],
        [
            "con descrizione del lavoro e note lunghe",
            buildReport({
                serviceDescription: "Sostituzione del display e della batteria, pulizia connettori. ".repeat(3),
                note: "Il cliente chiede di essere richiamato prima di procedere con ricambi non originali. ".repeat(2),
            }),
        ],
    ])("%s: una sola pagina, riempita fino in fondo", async (_label, report) => {
        const pdf = await createReportPdfBuffer(report);

        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        expect(countPages(pdf)).toBe(1);
        // Misura, sonda sul padding, PDF finale.
        expect(createPdf).toHaveBeenCalledTimes(3);

        // Senza la ridistribuzione avanzerebbero decine di punti in fondo al foglio.
        expect(await pagesWithExtraSpace(finalDefinition(), 6)).toBe(2);
    });

    /**
     * Il ramo di riserva: se già alla prima misura il contenuto non sta in un foglio non c'è
     * spazio da ridistribuire, niente sonda, e le righe da compilare scendono al minimo.
     */
    it("con un contenuto che non entra in un foglio salta la sonda e produce comunque il PDF", async () => {
        const pdf = await createReportPdfBuffer(
            buildReport({ note: "Nota molto lunga che occupa spazio. ".repeat(250) })
        );

        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        expect(createPdf).toHaveBeenCalledTimes(2);
        expect(countPages(pdf)).toBeGreaterThan(1);
    });
});
