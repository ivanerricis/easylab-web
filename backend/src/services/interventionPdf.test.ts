import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * pdfmake non va mai lasciato impaginare per davvero: qui interessa solo la definizione
 * di documento che i due generatori costruiscono, non il rendering. Si mocka l'intero
 * modulo e si intercetta l'argomento passato a `createPdf`.
 */
// `vi.mock` viene issato in cima al file: le funzioni finte devono nascere dentro
// `vi.hoisted`, altrimenti la fabbrica le referenzia prima che esistano.
const { createPdf, addFonts } = vi.hoisted(() => ({ createPdf: vi.fn(), addFonts: vi.fn() }));

vi.mock("pdfmake", () => ({ default: { addFonts, createPdf } }));

// Il logo passa da un fetch HTTP (vedi shared.test.ts): qui non deve mai farne uno vero.
const { loadImageDataUrl } = vi.hoisted(() => ({
    loadImageDataUrl: vi.fn<(url: string) => Promise<string | null>>(),
}));

vi.mock("./pdf/shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./pdf/shared")>();
    return { ...actual, loadImageDataUrl };
});

import { pdfStyles } from "./pdf/shared";
import {
    createCustomerInterventionsPdfBuffer,
    createInterventionPdfBuffer,
    formatInterventionType,
    type CustomerInterventionSummaryItem,
    type CustomerInterventionsPrintData,
    type InterventionPrintData,
} from "./interventionPdf";

const fakeBuffer = Buffer.from("finto-pdf");

beforeEach(() => {
    vi.clearAllMocks();
    loadImageDataUrl.mockResolvedValue(null);
    createPdf.mockImplementation(() => ({ getBuffer: vi.fn().mockResolvedValue(fakeBuffer) }));
});

const buildIntervention = (overrides: Partial<InterventionPrintData> = {}): InterventionPrintData => ({
    id: 42,
    labName: "Laboratorio Rossi",
    labEmail: "info@rossi.it",
    labAddress: "Via Roma 1",
    labPhone: "0123456789",
    labLogoUrl: "https://example.com/logo.png",
    customerName: "Mario Bianchi",
    customerPhone: "333123456",
    customerEmail: "mario@bianchi.it",
    collaboratorName: "Luigi Verdi",
    type: "intervento_sede",
    status: "completato",
    description: "Sostituita la scheda madre",
    problem: "Il PC non si accende",
    note: null,
    interventionDateLabel: "10/09/2026",
    startTime: "09:00",
    endTime: "11:30",
    createdAtLabel: "10/09/2026",
    ...overrides,
});

const buildCustomerInterventions = (
    overrides: Partial<CustomerInterventionsPrintData> = {}
): CustomerInterventionsPrintData => ({
    customerId: 5,
    customerName: "Mario Bianchi",
    customerPhone: "333123456",
    customerEmail: "mario@bianchi.it",
    labName: "Laboratorio Rossi",
    labEmail: "info@rossi.it",
    labAddress: "Via Roma 1",
    labPhone: "0123456789",
    labLogoUrl: "https://example.com/logo.png",
    interventionCount: 1,
    interventions: [],
    ...overrides,
});

const buildInterventionSummary = (
    overrides: Partial<CustomerInterventionSummaryItem> = {}
): CustomerInterventionSummaryItem => ({
    id: 9,
    createdAtLabel: "01/01/2026",
    type: "consegna_materiale",
    status: "in_lavorazione",
    description: "Consegnati due monitor",
    scheduleLabel: null,
    ...overrides,
});

/** Rigenera il PDF e restituisce la document definition passata a pdfmake, senza rumore fra i test. */
const captureInterventionDoc = async (intervention: InterventionPrintData) => {
    createPdf.mockClear();
    await createInterventionPdfBuffer(intervention);
    return createPdf.mock.calls[0][0] as Record<string, unknown>;
};

const captureCustomerInterventionsDoc = async (customer: CustomerInterventionsPrintData) => {
    createPdf.mockClear();
    await createCustomerInterventionsPdfBuffer(customer);
    return createPdf.mock.calls[0][0] as Record<string, unknown>;
};

describe("formatInterventionType", () => {
    it("mappa ciascun valore di InterventionType nella sua etichetta italiana", () => {
        expect(formatInterventionType("consegna_materiale")).toBe("Consegna materiale");
        expect(formatInterventionType("intervento_sede")).toBe("Intervento in sede");
        expect(formatInterventionType("intervento_remoto")).toBe("Intervento da remoto");
    });
});

describe("createInterventionPdfBuffer", () => {
    it("scarica il logo del laboratorio e risolve nel buffer prodotto da pdfmake", async () => {
        loadImageDataUrl.mockResolvedValue("data:image/png;base64,AAA=");
        const intervention = buildIntervention();

        const result = await createInterventionPdfBuffer(intervention);

        expect(result).toBe(fakeBuffer);
        expect(loadImageDataUrl).toHaveBeenCalledWith(intervention.labLogoUrl);
        expect(createPdf).toHaveBeenCalledTimes(1);
    });

    it("passa a pdfmake una definizione A4 con gli stili condivisi e i dati dell'intervento", async () => {
        const intervention = buildIntervention();
        const doc = await captureInterventionDoc(intervention);

        expect(doc.pageSize).toBe("A4");
        expect(doc.styles).toBe(pdfStyles);
        expect(Array.isArray(doc.content)).toBe(true);

        const serialized = JSON.stringify(doc);
        expect(serialized).toContain(intervention.customerName);
        expect(serialized).toContain(`#${intervention.id}`);
    });

    it("mostra la sezione NOTE solo quando l'intervento ha effettivamente una nota", async () => {
        const senzaNota = JSON.stringify(await captureInterventionDoc(buildIntervention({ note: null })));
        const conNota = JSON.stringify(
            await captureInterventionDoc(buildIntervention({ note: "Richiamare il cliente lunedì" }))
        );

        expect(senzaNota).not.toContain("NOTE");
        expect(conNota).toContain("NOTE");
        expect(conNota).toContain("Richiamare il cliente lunedì");
    });

    it("mostra 'ORE TECNICI' solo per gli interventi in sede o da remoto, mai per la consegna materiale", async () => {
        const consegna = JSON.stringify(
            await captureInterventionDoc(buildIntervention({ type: "consegna_materiale" }))
        );
        const sede = JSON.stringify(await captureInterventionDoc(buildIntervention({ type: "intervento_sede" })));
        const remoto = JSON.stringify(await captureInterventionDoc(buildIntervention({ type: "intervento_remoto" })));

        expect(consegna).not.toContain("ORE TECNICI");
        expect(sede).toContain("ORE TECNICI");
        expect(remoto).toContain("ORE TECNICI");
    });

    it("calcola le ore lavorate solo quando l'orario di fine viene dopo quello di inizio", async () => {
        const orarioValido = JSON.stringify(
            await captureInterventionDoc(buildIntervention({ startTime: "09:00", endTime: "11:30" }))
        );
        const orarioInvertito = JSON.stringify(
            await captureInterventionDoc(buildIntervention({ startTime: "11:30", endTime: "09:00" }))
        );
        const orarioMancante = JSON.stringify(
            await captureInterventionDoc(buildIntervention({ startTime: null, endTime: null }))
        );

        expect(orarioValido).toContain("Ore lavorate");
        // 09:00 -> 11:30 sono 2,5 ore, con la virgola italiana al posto del punto.
        expect(orarioValido).toContain("2,50");
        expect(orarioInvertito).not.toContain("Ore lavorate");
        expect(orarioMancante).not.toContain("Ore lavorate");
    });

    it("mostra 'Problema riscontrato' solo quando l'intervento lo valorizza", async () => {
        const conProblema = JSON.stringify(
            await captureInterventionDoc(buildIntervention({ problem: "Non si accende" }))
        );
        const senzaProblema = JSON.stringify(await captureInterventionDoc(buildIntervention({ problem: null })));

        expect(conProblema).toContain("Problema riscontrato");
        expect(senzaProblema).not.toContain("Problema riscontrato");
    });
});

describe("createCustomerInterventionsPdfBuffer", () => {
    it("scarica il logo del laboratorio e risolve nel buffer prodotto da pdfmake", async () => {
        const customer = buildCustomerInterventions();

        const result = await createCustomerInterventionsPdfBuffer(customer);

        expect(result).toBe(fakeBuffer);
        expect(loadImageDataUrl).toHaveBeenCalledWith(customer.labLogoUrl);
    });

    it("include il nome del cliente e il conteggio interventi nell'intestazione", async () => {
        const customer = buildCustomerInterventions({ interventionCount: 3 });
        const serialized = JSON.stringify(await captureCustomerInterventionsDoc(customer));

        expect(serialized).toContain(customer.customerName);
        expect(serialized).toContain("3 interventi");
    });

    it("senza interventi mostra il messaggio di elenco vuoto invece di una tabella senza righe", async () => {
        const serialized = JSON.stringify(
            await captureCustomerInterventionsDoc(buildCustomerInterventions({ interventions: [] }))
        );

        expect(serialized).toContain("Nessun intervento disponibile");
    });

    it("con interventi elenca tipo, stato e descrizione di ciascuno", async () => {
        const serialized = JSON.stringify(
            await captureCustomerInterventionsDoc(
                buildCustomerInterventions({
                    interventions: [
                        buildInterventionSummary({
                            type: "consegna_materiale",
                            status: "in_lavorazione",
                            description: "Consegnati due monitor",
                        }),
                    ],
                })
            )
        );

        expect(serialized).toContain("Consegna materiale");
        expect(serialized).toContain("In lavorazione");
        expect(serialized).toContain("Consegnati due monitor");
        expect(serialized).not.toContain("Nessun intervento disponibile");
    });
});
