import pdfmake from "pdfmake";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Qui pdfmake è quello vero, a differenza di `reportPdf.test.ts`. L'algoritmo che fa riempire
 * alla ricevuta esattamente un foglio (misura, ridistribuzione dello spazio avanzato, riduzione
 * del testo quando non ci sta) lavora sulle posizioni che solo un'impaginazione reale produce:
 * con pdfmake finto l'hook di misura non scatta da solo.
 *
 * Ogni impaginazione costa da un decimo a mezzo secondo secondo la macchina, da qui il timeout.
 */
vi.setConfig({ testTimeout: 30_000 });

vi.mock("./pdf/shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./pdf/shared")>();
    return { ...actual, loadLogoDataUrl: () => Promise.resolve(null) };
});

import {
    createReportPdfBuffer,
    measureReceiptContentBottom,
    PADDING_COST_PER_POINT,
    type ReportPrintData,
} from "./reportPdf";

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
        // Una misura e il PDF finale.
        expect(createPdf).toHaveBeenCalledTimes(2);

        // Senza la ridistribuzione avanzerebbero decine di punti in fondo al foglio.
        expect(await pagesWithExtraSpace(finalDefinition(), 6)).toBe(2);
    });

    /**
     * Il difetto corretto il 2026-09-15: con i campi pieni fino a quanto l'API accetta la ricevuta
     * usciva su due pagine. Ora il testo si riduce finché ci sta, e il foglio resta pieno.
     */
    const fullText = "Il cliente segnala che il dispositivo si spegne da solo dopo pochi minuti di uso ".repeat(4);

    it.each([
        [
            "problema e note a 255 caratteri",
            buildReport({ issueDescription: fullText.slice(0, 255), note: fullText.slice(0, 255) }),
        ],
        ["una password di 255 caratteri", buildReport({ password: fullText.slice(0, 255) })],
        [
            "nome del cliente e dispositivo lunghi",
            buildReport({ customerName: fullText.slice(0, 120), deviceName: fullText.slice(0, 120) }),
        ],
    ])("%s: una sola pagina, riempita fino in fondo", async (_label, report) => {
        const pdf = await createReportPdfBuffer(report);

        expect(countPages(pdf)).toBe(1);
        expect(await pagesWithExtraSpace(finalDefinition(), 6)).toBe(2);
    });

    /**
     * Il ramo di riserva: un testo che non entra nemmeno al corpo più piccolo. L'API non lo
     * accetta (i campi hanno un tetto di 255 caratteri), ma il PDF deve uscire lo stesso.
     */
    it("con un contenuto che non entra in un foglio nemmeno ridotto produce comunque il PDF", async () => {
        const pdf = await createReportPdfBuffer(
            buildReport({ note: "Nota molto lunga che occupa spazio. ".repeat(250) })
        );

        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        // Cinque misure (righe a mano alte, poi basse a quattro corpi diversi) e il PDF finale.
        expect(createPdf).toHaveBeenCalledTimes(6);
        expect(countPages(pdf)).toBeGreaterThan(1);
    });
});

/**
 * La seconda misura che la ricevuta faceva a ogni stampa — quanto spazio costa un punto di
 * padding — è diventata una costante perché è sempre venuta uguale. Questo test la rifà nel modo
 * di prima su ricevute diverse: se un giorno l'impaginato cambia, fallisce qui invece di lasciare
 * ricevute che sbordano o che non arrivano in fondo al foglio.
 */
describe("PADDING_COST_PER_POINT", () => {
    it.each([
        ["con i dati essenziali", buildReport()],
        ["con la descrizione del lavoro", buildReport({ serviceDescription: "Sostituito il display. ".repeat(8) })],
        [
            "con problema e note lunghi",
            buildReport({ issueDescription: "Non si accende. ".repeat(10), note: "Richiamare. ".repeat(12) }),
        ],
        ["con l'avviso al cliente", buildReport({ alerted: true, dataBackup: true, charger: true })],
    ])("è quello che misura l'impaginazione vera %s", async (_label, report) => {
        const layout = { workRowHeight: 18, rowPadding: 2.5, valueFontSize: 11.75 };

        const bottom = await measureReceiptContentBottom(report, null, layout);
        const withLessPadding = await measureReceiptContentBottom(report, null, { ...layout, rowPadding: 1.5 });

        expect(bottom).not.toBeNull();
        expect(bottom! - withLessPadding!).toBeCloseTo(PADDING_COST_PER_POINT, 3);
    });
});
