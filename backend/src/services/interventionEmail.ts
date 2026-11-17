import type { InterventionType } from "./interventionLabels";
import { collectLabContacts, escapeHtml, renderLabEmailHtml } from "./labEmailLayout";

/**
 * L'email che accompagna il PDF dell'intervento. Sta in un modulo suo perché il testo
 * è la cosa che il cliente legge davvero: la rotta carica i dati, qui si decide cosa
 * scrivergli e come mostrarglielo.
 *
 * Regola di fondo: al cliente non interessa il numero interno dell'intervento, gli
 * interessa *quando* è stato fatto. Nessun identificativo compare quindi nell'oggetto,
 * nel testo o nel nome del file allegato: al suo posto c'è sempre la data.
 *
 * Il testo è lo stesso in ogni stato dell'intervento (programmato, in lavorazione,
 * completato): l'ha deciso il laboratorio il 2026-09-22, sapendo che per un intervento solo
 * programmato "il lavoro svolto" non c'è ancora.
 */
export type InterventionEmailData = {
    customerName: string;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    type: InterventionType;
    /**
     * Il giorno dell'intervento come YYYY-MM-DD: quello pianificato o, se manca, quello di
     * apertura della scheda. Lo sceglie la rotta, che lo usa anche per il nome dell'allegato.
     */
    day: string;
    /** Identificativo dell'immagine allegata inline: null quando il logo non è disponibile. */
    logoCid: string | null;
};

type InterventionEmailContent = {
    subject: string;
    text: string;
    html: string;
};

/**
 * Come si chiama la pratica nell'oggetto e nella prima frase. Il tipo sta dentro la frase e
 * non più in un riquadro "Data / Tipo" a parte, che ripeteva una data già detta due volte.
 */
const wordingByType: Record<InterventionType, { subject: string; summary: string; detail: string }> = {
    material_delivery: {
        subject: "consegna",
        summary: "della consegna di materiale",
        detail: "di quanto consegnato",
    },
    customer_site: {
        subject: "intervento",
        summary: "dell'intervento in sede",
        detail: "del lavoro svolto",
    },
    remote: {
        subject: "intervento",
        summary: "dell'intervento da remoto",
        detail: "del lavoro svolto",
    },
    lab: {
        subject: "intervento",
        summary: "dell'intervento in laboratorio",
        detail: "del lavoro svolto",
    },
};

// Per esteso ("22 settembre 2026"), perché sta dentro una frase. Il giorno non ha fuso: letto
// e scritto in UTC resta quello, come in `formatDayLabel` (routes/formatting.ts).
const dayFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "UTC" });

const formatDay = (day: string) => dayFormatter.format(new Date(`${day}T00:00:00Z`));

export const buildInterventionEmail = (data: InterventionEmailData): InterventionEmailContent => {
    const dateLabel = formatDay(data.day);
    const wording = wordingByType[data.type];
    const contacts = collectLabContacts(data);

    const subject = `Riepilogo ${wording.subject} del ${dateLabel} - ${data.labName}`;

    // Versione solo testo: dice le stesse cose dell'HTML, per i client che non lo mostrano.
    const text = [
        `Gentile ${data.customerName},`,
        `in allegato trova il riepilogo ${wording.summary} del ${dateLabel}, con il dettaglio ${wording.detail}. Le consigliamo di conservarlo.`,
        "Per qualsiasi domanda può rispondere a questa email o contattarci ai recapiti qui sotto.",
        "Grazie per la fiducia.",
        `Cordiali saluti,\n${data.labName}`,
        contacts.join("\n"),
    ]
        .filter(Boolean)
        .join("\n\n");

    const html = renderLabEmailHtml({
        labName: data.labName,
        logoCid: data.logoCid,
        paragraphsHtml: [
            `Gentile <strong>${escapeHtml(data.customerName)}</strong>,`,
            `in allegato trova il riepilogo ${wording.summary} del <strong>${escapeHtml(dateLabel)}</strong>, con il dettaglio ${wording.detail}. Le consigliamo di conservarlo.`,
            "Per qualsiasi domanda può rispondere a questa email o contattarci ai recapiti qui sotto.",
            "Grazie per la fiducia.",
            `Cordiali saluti,<br /><strong>${escapeHtml(data.labName)}</strong>`,
        ],
        contacts,
    });

    return { subject, text, html };
};
