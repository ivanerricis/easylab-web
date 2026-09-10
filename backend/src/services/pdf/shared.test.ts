import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildCustomerSummaryHeader,
    buildCustomerSummaryInfoSection,
    dualFieldRow,
    loadImage,
    loadImageDataUrl,
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

describe("loadImage", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("scarica il logo e restituisce contenuto e content-type dalla risposta", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: (key: string) => (key === "content-type" ? "image/svg+xml" : null) },
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        });
        vi.stubGlobal("fetch", fetchMock);

        const image = await loadImage("https://example.com/logo.svg");

        expect(image).toEqual({ content: Buffer.from([1, 2, 3]), contentType: "image/svg+xml" });
    });

    it("senza header content-type ripiega su image/png", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => null },
                arrayBuffer: async () => new Uint8Array([9]).buffer,
            })
        );

        const image = await loadImage("https://example.com/logo");

        expect(image?.contentType).toBe("image/png");
    });

    it("una risposta non-ok (es. 404) restituisce null invece di lanciare", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        expect(await loadImage("https://example.com/assente.png")).toBeNull();
    });

    it("un errore di rete (host irraggiungibile) restituisce null invece di far fallire il PDF", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(new Error("ENOTFOUND"))
        );

        expect(await loadImage("https://non-esiste.invalid/logo.png")).toBeNull();
    });
});

describe("loadImageDataUrl", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("codifica il contenuto scaricato come data URL base64", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => "image/png" },
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            })
        );

        const dataUrl = await loadImageDataUrl("https://example.com/logo.png");

        expect(dataUrl).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
    });

    it("quando il download fallisce restituisce null, cosi' i PDF omettono il logo invece di rompersi", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        expect(await loadImageDataUrl("https://example.com/assente.png")).toBeNull();
    });
});
