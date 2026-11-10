import { beforeEach, describe, expect, it, vi } from "vitest";

// Come in interventionPdf.test.ts: pdfmake non impagina davvero, interessa la definizione.
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
import { createContractPdfBuffer, type ContractPrintData } from "./contractPdf";

const fakeBuffer = Buffer.from("finto-pdf");

beforeEach(() => {
    vi.clearAllMocks();
    loadLogoDataUrl.mockResolvedValue(null);
    createPdf.mockImplementation(() => ({ getBuffer: vi.fn().mockResolvedValue(fakeBuffer) }));
});

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
    note: null,
    assistance: {
        assistanceTypeLabel: "In sede o in laboratorio",
        includedHoursLabel: "20 h al mese",
        coveredInterventionTypes: ["Intervento in sede", "Intervento in laboratorio"],
    },
    monthlyHours: [],
    ...overrides,
});

type Doc = {
    content: unknown[];
    watermark?: { text: string };
    styles: unknown;
    pageSize: string;
};

const captureDoc = async (contract: ContractPrintData) => {
    createPdf.mockClear();
    await createContractPdfBuffer(contract);
    return createPdf.mock.calls[0][0] as Doc;
};

// Tutto il testo della definizione, in un'unica stringa: basta per cercare diciture e titoli.
const allText = (doc: Doc) => JSON.stringify(doc.content);

const signatureLabels = (doc: Doc) => {
    const columns = (doc.content.at(-1) as { columns: { stack?: { text?: string }[] }[] }).columns;
    return columns.filter((column) => column.stack).map((column) => column.stack?.[0].text);
};

describe("createContractPdfBuffer", () => {
    it("risolve nel buffer prodotto da pdfmake, con il logo del fornitore e non quello del laboratorio", async () => {
        const logo = "data:image/png;base64,AAA=";
        const doc = await captureDoc(buildContract({ providerLogoDataUrl: logo }));

        expect(createPdf).toHaveBeenCalledTimes(1);
        expect(loadLogoDataUrl).not.toHaveBeenCalled();
        expect(JSON.stringify(doc.content)).toContain(logo);
    });

    it("l'intestazione ha i dati del fornitore, senza indirizzo", async () => {
        const text = allText(await captureDoc(buildContract({ providerLogoDataUrl: null })));

        expect(text).toContain("Acme Srl");
        expect(text).toContain("info@acme.it");
        expect(text).not.toContain("Via Roma");
    });

    it("passa una definizione A4 con gli stili condivisi", async () => {
        const doc = await captureDoc(buildContract());

        expect(doc.pageSize).toBe("A4");
        expect(doc.styles).toBe(pdfStyles);
    });

    describe("contratto attivo", () => {
        it("ha il titolo Contratto, nessun watermark e il periodo di validità", async () => {
            const doc = await captureDoc(buildContract());
            const text = allText(doc);

            expect(text).toContain("Contratto #7");
            expect(text).not.toContain("Preventivo");
            expect(doc.watermark).toBeUndefined();
            expect(text).toContain("DATI DEL CONTRATTO");
            expect(text).toContain("Validità");
            expect(text).toContain("dal 1 ott 2026 al 1 ott 2027");
            expect(text).not.toContain("non costituisce contratto");
        });

        it("ha le firme del laboratorio e del cliente", async () => {
            const doc = await captureDoc(buildContract());

            expect(signatureLabels(doc)).toEqual(["Firma del laboratorio", "Firma del cliente"]);
        });

        it("non ha la riga di stato", async () => {
            const text = allText(await captureDoc(buildContract()));

            expect(text).not.toContain("CONTRATTO ANNULLATO");
            expect(text).not.toContain("CONTRATTO SCADUTO");
        });
    });

    describe("preventivo (bozza)", () => {
        const quote = () => buildContract({ kind: "quote", status: "draft" });

        it("ha il titolo Preventivo e il watermark", async () => {
            const doc = await captureDoc(quote());
            const text = allText(doc);

            expect(text).toContain("Preventivo #7");
            expect(text).not.toContain("Contratto #7");
            expect(doc.watermark?.text).toBe("PREVENTIVO");
        });

        it("usa le etichette proposte e nessun periodo di validità", async () => {
            const text = allText(await captureDoc(quote()));

            expect(text).toContain("DATI DEL PREVENTIVO");
            expect(text).toContain("Decorrenza");
            expect(text).toContain("Durata");
            expect(text).not.toContain("Validità");
        });

        it("aggiunge la dicitura di non vincolo e le firme di accettazione", async () => {
            const doc = await captureDoc(quote());

            expect(allText(doc)).toContain(
                "Il presente documento è un preventivo e non costituisce contratto fino all'accettazione."
            );
            expect(signatureLabels(doc)).toEqual(["Per il laboratorio", "Per accettazione (il cliente)"]);
        });

        it("non mostra il riepilogo ore, nemmeno se gli vengono passati dati", async () => {
            const text = allText(
                await captureDoc(
                    buildContract({
                        kind: "quote",
                        status: "draft",
                        monthlyHours: [{ monthLabel: "ottobre 2026", usedHoursLabel: "3 h", usageLabel: "15%" }],
                    })
                )
            );

            expect(text).not.toContain("RIEPILOGO ORE");
        });
    });

    describe("annullato e scaduto", () => {
        it.each([
            ["cancelled", "CONTRATTO ANNULLATO"],
            ["expired", "CONTRATTO SCADUTO"],
        ] as const)("stato %s: riga di stato, titolo Contratto, niente watermark", async (status, banner) => {
            const doc = await captureDoc(buildContract({ status }));
            const text = allText(doc);

            expect(text).toContain(banner);
            expect(text).toContain("Contratto #7");
            expect(doc.watermark).toBeUndefined();
            expect(signatureLabels(doc)).toEqual(["Firma del laboratorio", "Firma del cliente"]);
        });
    });

    describe("pacchetto di assistenza", () => {
        it("compare per l'assistenza con tipo, ore e interventi coperti", async () => {
            const text = allText(await captureDoc(buildContract()));

            expect(text).toContain("PACCHETTO DI ASSISTENZA");
            expect(text).toContain("In sede o in laboratorio");
            expect(text).toContain("20 h al mese");
            expect(text).toContain("Intervento in sede, Intervento in laboratorio");
            expect(text).toContain("Le ore valgono per mese di calendario e non si riportano al mese successivo");
        });

        it("non compare per il noleggio", async () => {
            const text = allText(await captureDoc(buildContract({ type: "rental", assistance: null })));

            expect(text).not.toContain("PACCHETTO DI ASSISTENZA");
            expect(text).toContain("Noleggio");
        });
    });

    describe("riepilogo ore", () => {
        it("è omesso quando lo storico è vuoto", async () => {
            const text = allText(await captureDoc(buildContract({ monthlyHours: [] })));

            expect(text).not.toContain("RIEPILOGO ORE");
        });

        it("elenca i mesi con intestazioni ripetute a ogni pagina", async () => {
            const doc = await captureDoc(
                buildContract({
                    monthlyHours: [
                        { monthLabel: "ottobre 2026", usedHoursLabel: "12,5 h", usageLabel: "63%" },
                        { monthLabel: "settembre 2026", usedHoursLabel: "3 h", usageLabel: "15%" },
                    ],
                })
            );
            const text = allText(doc);
            const table = doc.content.find((block) => JSON.stringify(block).includes("RIEPILOGO ORE")) as {
                table: { headerRows: number };
            };

            expect(table.table.headerRows).toBe(2);
            expect(text).toContain("Ore usate");
            expect(text).toContain("Ore incluse");
            expect(text).toContain("Utilizzo");
            expect(text).toContain("ottobre 2026");
            expect(text).toContain("12,5 h");
            expect(text).toContain("63%");
        });
    });

    describe("note", () => {
        it("sono omesse quando mancano", async () => {
            expect(allText(await captureDoc(buildContract({ note: null })))).not.toContain("NOTE");
        });

        it("compaiono quando presenti", async () => {
            const text = allText(await captureDoc(buildContract({ note: "Intervento entro 24 ore" })));

            expect(text).toContain("NOTE");
            expect(text).toContain("Intervento entro 24 ore");
        });
    });

    it("include la dicitura GDPR e mostra un trattino per i dati del cliente mancanti", async () => {
        const text = allText(
            await captureDoc(buildContract({ customerPhone: null, customerEmail: null, customerCity: null }))
        );

        expect(text).toContain("UE 2016/679 del 27 aprile 2016 (GDPR)");
        expect(text).toContain('"text":"-"');
    });
});
