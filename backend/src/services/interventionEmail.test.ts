import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildInterventionEmail, type InterventionEmailData } from "./interventionEmail";

const baseData = (overrides: Partial<InterventionEmailData> = {}): InterventionEmailData => ({
    customerName: "Mario Rossi",
    labName: "Laboratorio EasyLab",
    labEmail: "info@easylab.it",
    labAddress: "Via Roma 1",
    labPhone: "011 1234567",
    type: "intervento_sede",
    day: "2026-09-10",
    logoCid: null,
    ...overrides,
});

const countOccurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("buildInterventionEmail", () => {
    // Il testo approvato dal laboratorio il 2026-09-22, per intero: cambiarlo deve essere una
    // scelta, non l'effetto collaterale di un'altra modifica.
    it("scrive il testo approvato, parola per parola", () => {
        const { subject, text } = buildInterventionEmail(baseData());

        expect(subject).toBe("Riepilogo intervento del 10 settembre 2026 - Laboratorio EasyLab");
        expect(text).toBe(
            [
                "Gentile Mario Rossi,",
                "in allegato trova il riepilogo dell'intervento in sede del 10 settembre 2026, con il dettaglio del lavoro svolto. Le consigliamo di conservarlo.",
                "Per qualsiasi domanda può rispondere a questa email o contattarci ai recapiti qui sotto.",
                "Grazie per la fiducia.",
                "Cordiali saluti,\nLaboratorio EasyLab",
                "Via Roma 1\n011 1234567\ninfo@easylab.it",
            ].join("\n\n")
        );
    });

    it.each([
        ["consegna_materiale", "Riepilogo consegna del", "della consegna di materiale", "di quanto consegnato"],
        ["intervento_sede", "Riepilogo intervento del", "dell'intervento in sede", "del lavoro svolto"],
        ["intervento_remoto", "Riepilogo intervento del", "dell'intervento da remoto", "del lavoro svolto"],
    ] as const)("per il tipo %s nomina la pratica in oggetto, testo e html", (type, subjectStart, summary, detail) => {
        const { subject, text, html } = buildInterventionEmail(baseData({ type }));

        expect(subject.startsWith(subjectStart)).toBe(true);
        expect(text).toContain(`il riepilogo ${summary} del 10 settembre 2026, con il dettaglio ${detail}.`);
        expect(html).toContain(
            `il riepilogo ${summary} del <strong>10 settembre 2026</strong>, con il dettaglio ${detail}.`
        );
    });

    // Il giorno arriva senza fuso: letto come ora locale, a Roma la mezzanotte del primo
    // gennaio sarebbe ancora il 31 dicembre in UTC. Come per `formatDayLabel`, il fuso del
    // processo lo cambia `companyManager` a server avviato, dopo l'import di questo modulo.
    it.each(["Europe/Rome", "America/New_York", "Pacific/Kiritimati"])(
        "scrive per esteso il giorno ricevuto senza spostarlo, anche con il processo in %s",
        (timeZone) => {
            const previous = process.env.TZ;
            process.env.TZ = timeZone;
            try {
                expect(buildInterventionEmail(baseData({ day: "2027-01-01" })).subject).toContain("1 gennaio 2027");
                expect(buildInterventionEmail(baseData({ day: "2026-12-31" })).subject).toContain("31 dicembre 2026");
            } finally {
                if (previous === undefined) {
                    delete process.env.TZ;
                } else {
                    process.env.TZ = previous;
                }
            }
        }
    );

    // Prima la data compariva in oggetto, prima frase e in un riquadro "Data / Tipo".
    it("nel corpo scrive la data una volta sola, senza il riquadro Data / Tipo", () => {
        const { text, html } = buildInterventionEmail(baseData());

        expect(countOccurrences(text, "10 settembre 2026")).toBe(1);
        expect(countOccurrences(html, "10 settembre 2026")).toBe(1);
        expect(text).not.toContain("Tipo:");
        expect(html).not.toContain(">Tipo<");
    });

    it("non menziona mai un identificativo interno, solo la data", () => {
        const { subject, text } = buildInterventionEmail(baseData());

        // Il tipo stesso non porta un id (vedi `InterventionEmailData`): qui si verifica che
        // oggetto e testo semplice (senza i colori esadecimali dell'HTML a confondere il
        // pattern) non contengano mai un riferimento tipo "intervento #123".
        expect(subject).not.toMatch(/#\d+/);
        expect(text).not.toMatch(/#\d+/);
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

        expect(text.endsWith("Laboratorio EasyLab\n\ninfo@easylab.it")).toBe(true);
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
});
