import { beforeEach, describe, expect, it, vi } from "vitest";

// `formatInterventionType` vive in `interventionPdf`, che trascina dentro pdfmake: qui interessa
// solo la mappatura tipo -> etichetta, quindi si mocka senza caricare la macchina PDF reale.
const formatInterventionType = vi.fn<(value: string) => string>(() => "Tipo di prova");

vi.mock("./interventionPdf", () => ({
    formatInterventionType: (value: string) => formatInterventionType(value) as string,
}));

import { buildInterventionEmail, type InterventionEmailData } from "./interventionEmail";

const baseData = (overrides: Partial<InterventionEmailData> = {}): InterventionEmailData => ({
    customerName: "Mario Rossi",
    labName: "Laboratorio EasyLab",
    labEmail: "info@easylab.it",
    labAddress: "Via Roma 1",
    labPhone: "011 1234567",
    type: "intervento_sede",
    interventionDateLabel: "10/09/2026",
    createdAtLabel: "01/09/2026",
    logoCid: null,
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    formatInterventionType.mockReturnValue("Intervento in sede");
});

describe("buildInterventionEmail", () => {
    it("usa la data dell'intervento nell'oggetto quando è pianificata", () => {
        const { subject } = buildInterventionEmail(baseData());

        expect(subject).toBe("Riepilogo intervento del 10/09/2026 - Laboratorio EasyLab");
    });

    // Un intervento senza data pianificata (es. consegna materiale) non ha comunque un buco
    // nell'email: si ripiega sulla data di apertura della scheda.
    it("ripiega sulla data di apertura quando l'intervento non è pianificato", () => {
        const { subject, text, html } = buildInterventionEmail(
            baseData({ interventionDateLabel: null, createdAtLabel: "01/09/2026" })
        );

        expect(subject).toContain("01/09/2026");
        expect(text).toContain("01/09/2026");
        expect(html).toContain("01/09/2026");
    });

    it("non menziona mai un identificativo interno, solo la data", () => {
        const { subject, text } = buildInterventionEmail(baseData());

        // Il tipo stesso non porta un id (vedi `InterventionEmailData`): qui si verifica che
        // oggetto e testo semplice (senza i colori esadecimali dell'HTML a confondere il
        // pattern) non contengano mai un riferimento tipo "intervento #123".
        expect(subject).not.toMatch(/#\d+/);
        expect(text).not.toMatch(/#\d+/);
    });

    it("passa il tipo a formatInterventionType e lo riporta in testo e html", () => {
        formatInterventionType.mockReturnValue("Consegna materiale");

        const { text, html } = buildInterventionEmail(baseData({ type: "consegna_materiale" }));

        expect(formatInterventionType).toHaveBeenCalledWith("consegna_materiale");
        expect(text).toContain("Consegna materiale");
        expect(html).toContain("Consegna materiale");
    });

    it("include il logo incorporato via cid solo quando disponibile", () => {
        const conLogo = buildInterventionEmail(baseData({ logoCid: "logo123" }));
        const senzaLogo = buildInterventionEmail(baseData({ logoCid: null }));

        expect(conLogo.html).toContain('src="cid:logo123"');
        expect(senzaLogo.html).not.toContain("cid:");
    });

    it("elenca solo i recapiti effettivamente valorizzati", () => {
        const { text, html } = buildInterventionEmail(
            baseData({ labAddress: "", labPhone: "   ", labEmail: "info@easylab.it" })
        );

        expect(text).toContain("info@easylab.it");
        expect(html).toContain("info@easylab.it");
    });

    it("non lascia una riga vuota di recapiti quando nessuno è valorizzato", () => {
        const { text } = buildInterventionEmail(baseData({ labAddress: "", labPhone: "", labEmail: "" }));

        expect(text.trim().endsWith("Laboratorio EasyLab")).toBe(true);
    });

    // L'HTML va in un client di posta: nome cliente e nome laboratorio ostili non devono
    // rompere il markup né aprire a injection.
    it("esegue l'escape HTML del contenuto ma lascia il testo semplice intatto", () => {
        const { text, html } = buildInterventionEmail(
            baseData({ customerName: `Mario <script>alert("x")</script> & Rossi` })
        );

        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("&amp;");
        expect(text).toContain(`Mario <script>alert("x")</script> & Rossi`);
    });

    it("il testo semplice contiene i dati essenziali senza markup", () => {
        const { text } = buildInterventionEmail(baseData());

        expect(text).toContain("Gentile Mario Rossi");
        expect(text).toContain("Laboratorio EasyLab");
        expect(text).not.toContain("<");
    });
});
