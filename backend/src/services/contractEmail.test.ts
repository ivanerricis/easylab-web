import { describe, expect, it } from "vitest";
import { buildContractEmail, signedContractAttachmentName, type ContractEmailData } from "./contractEmail";

const baseData = (overrides: Partial<ContractEmailData> = {}): ContractEmailData => ({
    customerName: "Mario Rossi",
    labName: "Laboratorio EasyLab",
    labEmail: "info@easylab.it",
    labAddress: "Via Roma 1",
    labPhone: "011 1234567",
    type: "assistance",
    device: "Server Dell PowerEdge",
    startDate: "2026-10-01",
    logoCid: null,
    ...overrides,
});

describe("buildContractEmail", () => {
    it("scrive oggetto e testo per un contratto di assistenza", () => {
        const { subject, text } = buildContractEmail(baseData());

        expect(subject).toBe("Contratto di assistenza firmato - Laboratorio EasyLab");
        expect(text).toBe(
            [
                "Gentile Mario Rossi,",
                "in allegato trova la copia firmata del contratto di assistenza per Server Dell PowerEdge, in vigore dal 1 ottobre 2026. Le consigliamo di conservarla.",
                "Per qualsiasi domanda può rispondere a questa email o contattarci ai recapiti qui sotto.",
                "Grazie per la fiducia.",
                "Cordiali saluti,\nLaboratorio EasyLab",
                "Via Roma 1\n011 1234567\ninfo@easylab.it",
            ].join("\n\n")
        );
    });

    it("nomina il noleggio quando il contratto è di noleggio", () => {
        const { subject, text, html } = buildContractEmail(baseData({ type: "rental" }));

        expect(subject).toBe("Contratto di noleggio firmato - Laboratorio EasyLab");
        expect(text).toContain("la copia firmata del contratto di noleggio per");
        expect(html).toContain("la copia firmata del contratto di noleggio per");
    });

    it("escapa nell'html i testi scritti dagli utenti", () => {
        const { html } = buildContractEmail(
            baseData({ customerName: "<script>x</script>", device: 'Stampante "A&B"' })
        );

        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
        expect(html).toContain("Stampante &quot;A&amp;B&quot;");
    });

    it("mostra il logo solo quando c'è", () => {
        expect(buildContractEmail(baseData()).html).not.toContain("cid:");
        expect(buildContractEmail(baseData({ logoCid: "logo-laboratorio" })).html).toContain(
            'src="cid:logo-laboratorio"'
        );
    });

    it("chiama l'allegato con la data di inizio", () => {
        expect(signedContractAttachmentName("2026-10-01")).toBe("contratto-firmato-2026-10-01.pdf");
    });
});
