import { describe, expect, it, vi } from "vitest";

// pdfmake vero: la definizione deve essere accettata dall'impaginatore e produrre un PDF.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("./pdf/shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./pdf/shared")>();
    return { ...actual, loadLogoDataUrl: () => Promise.resolve(null) };
});

import {
    createCustomerContractsPdfBuffer,
    type CustomerContractSummaryItem,
    type CustomerContractsPrintData,
} from "./contractPdf";

const buildData = (contracts: CustomerContractSummaryItem[]): CustomerContractsPrintData => ({
    customerId: 5,
    customerName: "Mario Bianchi",
    customerPhone: "333123456",
    customerEmail: "mario@bianchi.it",
    labName: "Laboratorio Rossi",
    labEmail: "info@rossi.it",
    labAddress: "Via Roma 1",
    labPhone: "0123456789",
    contractCount: contracts.length,
    contracts,
});

const buildItem = (id: number): CustomerContractSummaryItem => ({
    id,
    type: id % 3 === 0 ? "rental" : "assistance",
    status: (["active", "draft", "expired", "cancelled"] as const)[id % 4],
    providerName: "Fornitore con un nome piuttosto lungo Srl",
    device: "Server di produzione nella sala macchine del secondo piano",
    assistance: id % 3 === 0 ? null : { assistanceType: "on_site", includedHours: 10 },
    startDateLabel: "1 ott 2026",
    endDateLabel: "1 ott 2027",
});

const pageCount = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("createCustomerContractsPdfBuffer (render)", () => {
    it("produce un PDF valido anche senza contratti", async () => {
        const buffer = await createCustomerContractsPdfBuffer(buildData([]));

        expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    });

    it("impagina molti contratti su più pagine", async () => {
        const contracts = Array.from({ length: 120 }, (_, index) => buildItem(120 - index));
        const buffer = await createCustomerContractsPdfBuffer(buildData(contracts));

        expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
        expect(pageCount(buffer)).toBeGreaterThan(1);
    });
});
