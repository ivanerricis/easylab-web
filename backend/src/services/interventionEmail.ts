import type { InterventionType } from "./interventionLabels";

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

export type InterventionEmailContent = {
    subject: string;
    text: string;
    html: string;
};

const escapeHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const borderColor = "#e2e5ea";
const mutedColor = "#5b6672";
const textColor = "#1f2733";

/**
 * Come si chiama la pratica nell'oggetto e nella prima frase. Il tipo sta dentro la frase e
 * non più in un riquadro "Data / Tipo" a parte, che ripeteva una data già detta due volte.
 */
const wordingByType: Record<InterventionType, { subject: string; summary: string; detail: string }> = {
    consegna_materiale: {
        subject: "consegna",
        summary: "della consegna di materiale",
        detail: "di quanto consegnato",
    },
    intervento_sede: {
        subject: "intervento",
        summary: "dell'intervento in sede",
        detail: "del lavoro svolto",
    },
    intervento_remoto: {
        subject: "intervento",
        summary: "dell'intervento da remoto",
        detail: "del lavoro svolto",
    },
};

// Per esteso ("22 settembre 2026"), perché sta dentro una frase. Il giorno non ha fuso: letto
// e scritto in UTC resta quello, come in `formatDayLabel` (routes/formatting.ts).
const dayFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "UTC" });

const formatDay = (day: string) => dayFormatter.format(new Date(`${day}T00:00:00Z`));

const collectContacts = (data: InterventionEmailData) =>
    [data.labAddress, data.labPhone, data.labEmail]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

export const buildInterventionEmail = (data: InterventionEmailData): InterventionEmailContent => {
    const dateLabel = formatDay(data.day);
    const wording = wordingByType[data.type];
    const contacts = collectContacts(data);

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

    const logoCell = data.logoCid
        ? `<img src="cid:${data.logoCid}" width="44" height="44" alt="${escapeHtml(data.labName)}" style="display: block; width: 44px; height: 44px; border: 1px solid ${borderColor}; border-radius: 6px; object-fit: cover;" />`
        : "";

    // HTML da email: tabelle annidate, stili in linea e nessun asset esterno, perché è
    // l'unica struttura che i client di posta (Outlook in testa) rendono allo stesso modo.
    const html = `<!doctype html>
<html lang="it">
    <body style="margin: 0; padding: 0; background-color: #f4f5f7;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f5f7; padding: 24px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width: 100%; max-width: 600px; background-color: #ffffff; border: 1px solid ${borderColor}; border-radius: 10px; font-family: Arial, Helvetica, sans-serif; color: ${textColor};">
                        <tr>
                            <td style="padding: 20px 28px; border-bottom: 1px solid ${borderColor};">
                                <table role="presentation" cellpadding="0" cellspacing="0">
                                    <tr>
                                        ${logoCell ? `<td style="padding-right: 12px;">${logoCell}</td>` : ""}
                                        <td style="font-size: 17px; font-weight: bold; color: ${textColor};">${escapeHtml(data.labName)}</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 28px 28px 12px 28px; font-size: 15px; line-height: 1.6;">
                                <p style="margin: 0 0 16px 0;">Gentile <strong>${escapeHtml(data.customerName)}</strong>,</p>
                                <p style="margin: 0 0 16px 0;">in allegato trova il riepilogo ${wording.summary} del <strong>${escapeHtml(dateLabel)}</strong>, con il dettaglio ${wording.detail}. Le consigliamo di conservarlo.</p>
                                <p style="margin: 0 0 16px 0;">Per qualsiasi domanda può rispondere a questa email o contattarci ai recapiti qui sotto.</p>
                                <p style="margin: 0 0 16px 0;">Grazie per la fiducia.</p>
                                <p style="margin: 0 0 20px 0;">Cordiali saluti,<br /><strong>${escapeHtml(data.labName)}</strong></p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 16px 28px; border-top: 1px solid ${borderColor}; font-size: 12px; line-height: 1.6; color: ${mutedColor};">
                                ${contacts.map((contact) => escapeHtml(contact)).join(" &nbsp;&middot;&nbsp; ")}
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>`;

    return { subject, text, html };
};
