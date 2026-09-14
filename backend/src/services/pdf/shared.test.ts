import path from "node:path";
import pdfmake from "pdfmake";
import { describe, expect, it, vi } from "vitest";

const { loadPrintableLogo } = vi.hoisted(() => ({
    loadPrintableLogo: vi.fn<() => Promise<{ content: Buffer; contentType: "image/png" } | null>>(),
}));

vi.mock("../logoManager", () => ({ loadPrintableLogo }));

import {
    buildCustomerSummaryHeader,
    buildCustomerSummaryInfoSection,
    dualFieldRow,
    loadLogoDataUrl,
    sectionBarCell,
    sectionBarRow,
    type CustomerSummaryHeaderData,
} from "./shared";

const buildCustomer = (overrides: Partial<CustomerSummaryHeaderData> = {}): CustomerSummaryHeaderData => ({
    customerId: 5,
    customerName: "Mario Bianchi",
    customerPhone: "333123456",
    customerEmail: "mario@bianchi.it",
    labName: "Laboratorio Rossi",
    labEmail: "info@rossi.it",
    labAddress: "Via Roma 1",
    labPhone: "0123456789",
    ...overrides,
});

/** Il blocco meta (titolo + range opzionale + conteggio) e' annidato dentro columns/table/body. */
const getMetaStack = (header: ReturnType<typeof buildCustomerSummaryHeader>) =>
    (header.columns[1] as unknown as { table: { body: [[{ stack: { text: string }[] }]] } }).table.body[0][0].stack;

describe("sectionBarCell", () => {
    it("senza colSpan non aggiunge la proprietà, per non forzare uno span implicito", () => {
        const cell = sectionBarCell("CLIENTE");

        expect(cell).toEqual({
            text: "CLIENTE",
            style: "sectionBar",
            alignment: "center",
            fillColor: "#E7ECF3",
        });
        expect(cell).not.toHaveProperty("colSpan");
    });

    it("con colSpan la include nel risultato", () => {
        const cell = sectionBarCell("CLIENTE", 4);

        expect(cell.colSpan).toBe(4);
    });
});

describe("sectionBarRow", () => {
    it("produce una riga lunga quanto colSpan, con la barra solo nella prima cella", () => {
        const row = sectionBarRow("NOTE", 3);

        expect(row).toHaveLength(3);
        expect(row[0]).toMatchObject({ text: "NOTE", colSpan: 3 });
        expect(row[1]).toEqual({});
        expect(row[2]).toEqual({});
    });
});

describe("dualFieldRow", () => {
    it("produce le quattro celle etichetta/valore nell'ordine dato", () => {
        const row = dualFieldRow("Cliente", "Mario Bianchi", "Telefono", "333123456");

        expect(row).toEqual([
            { text: "Cliente", style: "label" },
            { text: "Mario Bianchi", style: "value" },
            { text: "Telefono", style: "label" },
            { text: "333123456", style: "value" },
        ]);
    });

    it("un valore mancante resta una stringa vuota, non '-': la sostituzione è a carico del chiamante", () => {
        const row = dualFieldRow("Email", "", "Collaboratore", "Luigi Verdi");

        expect(row[1]).toEqual({ text: "", style: "value" });
    });
});

describe("buildCustomerSummaryHeader", () => {
    it("senza logo lascia la colonna del logo vuota invece di un'immagine rotta", () => {
        const header = buildCustomerSummaryHeader(buildCustomer(), null, "3 report");
        const logoColumn = (header.columns[0] as { columns: unknown[] }).columns[0];

        expect(logoColumn).toEqual({ width: 56, text: "" });
    });

    it("con il logo genera la colonna immagine con il data URL passato", () => {
        const header = buildCustomerSummaryHeader(buildCustomer(), "data:image/png;base64,AAA=", "3 report");
        const logoColumn = (header.columns[0] as { columns: unknown[] }).columns[0];

        expect(logoColumn).toMatchObject({ width: 56, image: "data:image/png;base64,AAA=", fit: [52, 52] });
    });

    it("il countLabel passato è l'unica riga che cambia fra riepiloghi report e interventi", () => {
        const header = buildCustomerSummaryHeader(buildCustomer(), null, "7 interventi");

        expect(getMetaStack(header).at(-1)).toMatchObject({ text: "7 interventi" });
    });

    it("senza rangeLabel il blocco meta ha solo titolo e conteggio", () => {
        const header = buildCustomerSummaryHeader(buildCustomer({ rangeLabel: undefined }), null, "3 report");

        expect(getMetaStack(header)).toHaveLength(2);
    });

    it("con rangeLabel il blocco meta lo inserisce fra titolo e conteggio", () => {
        const header = buildCustomerSummaryHeader(
            buildCustomer({ rangeLabel: "01/01/2026 - 31/01/2026" }),
            null,
            "3 report"
        );
        const metaStack = getMetaStack(header);

        expect(metaStack).toHaveLength(3);
        expect(metaStack[1]).toMatchObject({ text: "01/01/2026 - 31/01/2026" });
    });
});

describe("buildCustomerSummaryInfoSection", () => {
    it("mette cliente e telefono sulla stessa riga e l'email su tutta la larghezza", () => {
        const section = buildCustomerSummaryInfoSection(buildCustomer());
        const emailRow = section.table.body[2] as { text?: string; colSpan?: number }[];

        expect(emailRow[0]).toMatchObject({ text: "Email" });
        expect(emailRow[1]).toMatchObject({ text: "mario@bianchi.it", colSpan: 3 });
    });

    it("un'email assente diventa '-', non una cella vuota", () => {
        const section = buildCustomerSummaryInfoSection(buildCustomer({ customerEmail: "" }));
        const emailRow = section.table.body[2] as { text?: string }[];

        expect(emailRow[1]).toMatchObject({ text: "-" });
    });
});

describe("policy di accesso di pdfmake", () => {
    const render = (content: unknown[]) =>
        pdfmake.createPdf({ content, defaultStyle: { font: "Roboto" } } as never).getBuffer();

    it("un PDF che usa solo i font inclusi viene generato normalmente", async () => {
        const pdf = await render([{ text: "ciao" }]);

        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    });

    it("rifiuta di scaricare un'immagine da un URL", async () => {
        await expect(render([{ image: "http://127.0.0.1:1/logo.png" }])).rejects.toThrow(/denied/);
    });

    it("rifiuta di leggere un file del server fuori dalla cartella dei font", async () => {
        await expect(render([{ image: path.resolve("package.json") }])).rejects.toThrow(/denied/);
    });
});

describe("loadLogoDataUrl", () => {
    it("codifica il logo stampabile come data URL base64", async () => {
        loadPrintableLogo.mockResolvedValue({ content: Buffer.from([1, 2, 3]), contentType: "image/png" });

        const dataUrl = await loadLogoDataUrl();

        expect(dataUrl).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
    });

    it("senza logo disponibile restituisce null, così i PDF omettono il logo invece di rompersi", async () => {
        loadPrintableLogo.mockResolvedValue(null);

        expect(await loadLogoDataUrl()).toBeNull();
    });

    // Il logo prima si scaricava da un URL composto con l'header Host della richiesta: chi
    // chiedeva il PDF sceglieva l'host contattato dal backend (SSRF).
    it("non fa nessuna richiesta di rete", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        loadPrintableLogo.mockResolvedValue({ content: Buffer.from([1]), contentType: "image/png" });

        await loadLogoDataUrl();

        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
