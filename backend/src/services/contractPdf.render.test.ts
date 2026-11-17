import { describe, expect, it, vi } from "vitest";

/**
 * Qui pdfmake è quello vero: la definizione deve essere accettata dall'impaginatore e produrre
 * un file PDF. Ogni impaginazione costa fino a mezzo secondo, da qui il timeout.
 */
vi.setConfig({ testTimeout: 30_000 });

vi.mock("./pdf/shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./pdf/shared")>();
    return { ...actual, loadLogoDataUrl: () => Promise.resolve(null) };
});

import { createContractPdfBuffer, type ContractPrintData } from "./contractPdf";

const buildContract = (overrides: Partial<ContractPrintData> = {}): ContractPrintData => ({
    id: 7,
    kind: "contract",
    status: "active",
    issuedAtLabel: "3 nov 2026",
    customerName: "Mario Bianchi",
    customerPhone: "333123456",
    customerEmail: "mario@bianchi.it",
    customerCity: "Torino",
    providerName: "Acme Srl",
    providerLogoDataUrl: null,
    providerContact: "Luca Neri",
    providerEmail: "info@acme.it",
    providerPhone: "011222333",
    type: "assistance",
    device: "Server NAS",
    termLabel: "12 mesi",
    billingLabel: null,
    startDateLabel: "1 ott 2026",
    endDateLabel: "1 ott 2027",
    note: "Intervento entro 24 ore dalla chiamata",
    assistance: {
        period: "month",
        packageName: "Pronti Via 20",
        includedHoursLabel: "20 ore al mese",
        priceLabel: "500,00 € al mese + IVA",
        priorityLabel: "3",
        typology: "Teleassistenza, on site e in laboratorio: hardware, software, formazione",
        coveredInterventionTypes: ["Intervento da remoto", "Intervento in sede", "Intervento in laboratorio"],
    },
    monthlyHours: [
        { monthLabel: "ottobre 2026", usedHoursLabel: "12,5 h", usageLabel: "63%", cumulativeLabel: null },
        { monthLabel: "settembre 2026", usedHoursLabel: "3 h", usageLabel: "15%", cumulativeLabel: null },
    ],
    ...overrides,
});

const expectPdf = (buffer: Buffer) => {
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
};

describe("createContractPdfBuffer (pdfmake reale)", () => {
    it("genera il PDF di una bozza (preventivo)", async () => {
        expectPdf(await createContractPdfBuffer(buildContract({ kind: "quote", status: "draft", monthlyHours: [] })));
    });

    it("genera il PDF di un contratto attivo con lo storico delle ore", async () => {
        expectPdf(await createContractPdfBuffer(buildContract()));
    });

    it("genera il PDF di un noleggio e di un contratto annullato", async () => {
        expectPdf(await createContractPdfBuffer(buildContract({ type: "rental", assistance: null, monthlyHours: [] })));
        expectPdf(await createContractPdfBuffer(buildContract({ status: "cancelled" })));
    });
});
