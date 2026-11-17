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
    customerName: "Luca Verdi",
    device: "Server NAS",
    assistance: { package: "ready_20", includedHours: 20, priceCents: 50000 },
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
            "Pronti Via 20 - 20 ore al mese - 500,00 € al mese + IVA",
            "1 ott 2026",
            "1 ott 2027",
        ]);
        expect(rows[1][1]).toBe("Noleggio");
        expect(rows[1][5]).toBe("-");
    });

    it("nel resoconto di un fornitore la colonna dell'altra parte è il cliente", async () => {
        const doc = await capture({ ...buildData([buildItem({ id: 9 })]), subjectLabel: "Fornitore" });
        const { table } = tableOf(doc);
        const headers = table.body[1].map((cell) => cell.text);

        expect(headers[3]).toBe("Cliente");
        expect(dataRows(doc)[0][3]).toBe("Luca Verdi");
        expect(JSON.stringify(doc)).toContain("Fornitore #5");
    });

    it("etichetta come preventivo la bozza e scrive il Supporto con le ore su 12 mesi e il prezzo unico", async () => {
        const doc = await capture(
            buildData([
                buildItem({ id: 2, status: "draft" }),
                buildItem({ id: 1, assistance: { package: "support_base", includedHours: 80, priceCents: 160000 } }),
            ])
        );
        const rows = dataRows(doc);

        expect(rows[0][2]).toBe("Bozza (preventivo)");
        expect(rows[1][5]).toBe("Supporto Base - 80 ore in 12 mesi - 1.600,00 € + IVA");
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
