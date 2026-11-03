import { beforeEach, describe, expect, it, vi } from "vitest";

// pdfmake e il logo sono finti: interessa solo la definizione di documento costruita.
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
    createCustomerContractsPdfBuffer,
    type CustomerContractSummaryItem,
    type CustomerContractsPrintData,
} from "./contractPdf";

const fakeBuffer = Buffer.from("finto-pdf");

beforeEach(() => {
    vi.clearAllMocks();
    loadLogoDataUrl.mockResolvedValue(null);
    createPdf.mockImplementation(() => ({ getBuffer: vi.fn().mockResolvedValue(fakeBuffer) }));
});

const buildItem = (overrides: Partial<CustomerContractSummaryItem> = {}): CustomerContractSummaryItem => ({
    id: 3,
    type: "assistance",
    status: "active",
    providerName: "Acme Srl",
    device: "Server NAS",
    assistance: { assistanceType: "on_site", includedHours: 10 },
    startDateLabel: "1 ott 2026",
    endDateLabel: "1 ott 2027",
    ...overrides,
});

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

type Doc = { content: Record<string, unknown>[]; pageSize: string; styles: unknown };

const capture = async (data: CustomerContractsPrintData) => {
    await createCustomerContractsPdfBuffer(data);
    return createPdf.mock.calls[0][0] as Doc;
};

const tableOf = (doc: Doc) =>
    doc.content.find((node) => (node.table as { headerRows?: number } | undefined)?.headerRows === 2) as {
        table: { headerRows: number; body: Record<string, unknown>[][] };
    };

const dataRows = (doc: Doc) =>
    tableOf(doc)
        .table.body.slice(2)
        .map((row) => row.map((cell) => cell.text));

describe("createCustomerContractsPdfBuffer", () => {
    it("produce un A4 con gli stili condivisi, il titolo e i dati del cliente", async () => {
        const result = await createCustomerContractsPdfBuffer(buildData([buildItem()]));
        const doc = createPdf.mock.calls[0][0] as Doc;
        const serialized = JSON.stringify(doc);

        expect(result).toBe(fakeBuffer);
        expect(doc.pageSize).toBe("A4");
        expect(doc.styles).toBe(pdfStyles);
        expect(serialized).toContain('"text":"Contratti"');
        expect(serialized).toContain("Mario Bianchi");
        expect(serialized).toContain("Cliente #5");
        expect(serialized).toContain("1 contratto");
    });

    it("stampa una riga per contratto con tipo, fornitore, pacchetto e date, e ripete le intestazioni", async () => {
        const doc = await capture(
            buildData([
                buildItem({ id: 9 }),
                buildItem({ id: 4, type: "rental", device: "Notebook", assistance: null }),
            ])
        );
        const { table } = tableOf(doc);
        const rows = dataRows(doc);

        // Barra di sezione + intestazione colonne + una riga per contratto.
        expect(table.headerRows).toBe(2);
        expect(table.body).toHaveLength(4);
        expect(rows[0]).toEqual([
            "9",
            "Assistenza",
            "Attivo",
            "Acme Srl",
            "Server NAS",
            "In sede o in laboratorio - 10 h/mese",
            "1 ott 2026",
            "1 ott 2027",
        ]);
        expect(rows[1][1]).toBe("Noleggio");
        expect(rows[1][5]).toBe("-");
    });

    it("etichetta come preventivo la bozza e dice ore illimitate per il full time", async () => {
        const doc = await capture(
            buildData([
                buildItem({ id: 2, status: "draft" }),
                buildItem({ id: 1, assistance: { assistanceType: "full_time", includedHours: null } }),
            ])
        );
        const rows = dataRows(doc);

        expect(rows[0][2]).toBe("Bozza (preventivo)");
        expect(rows[1][5]).toBe("Full time - ore illimitate");
    });

    it("riassume i contratti per stato, solo quelli presenti", async () => {
        const doc = await capture(
            buildData([
                buildItem({ id: 4 }),
                buildItem({ id: 3 }),
                buildItem({ id: 2, status: "draft" }),
                buildItem({ id: 1, status: "expired" }),
            ])
        );

        expect(JSON.stringify(doc)).toContain("2 attivi, 1 bozza, 1 scaduto");
    });

    it("senza contratti dice 'Nessun contratto' e non stampa il riepilogo", async () => {
        const doc = await capture(buildData([]));
        const serialized = JSON.stringify(doc);

        expect(serialized).toContain("Nessun contratto");
        expect(serialized).toContain("0 contratti");
        expect(serialized).not.toContain("attivi");
    });
});
