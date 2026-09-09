import type { InterventionType } from "./interventionPdf";
import { formatInterventionType } from "./interventionPdf";

/**
 * L'email che accompagna il PDF dell'intervento. Sta in un modulo suo perché il testo
 * è la cosa che il cliente legge davvero: la rotta carica i dati, qui si decide cosa
 * scrivergli e come mostrarglielo.
 *
 * Regola di fondo: al cliente non interessa il numero interno dell'intervento, gli
 * interessa *quando* è stato fatto. Nessun identificativo compare quindi nell'oggetto,
 * nel testo o nel nome del file allegato: al suo posto c'è sempre la data.
 */
export type InterventionEmailData = {
    customerName: string;
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
    type: InterventionType;
    /** Data dell'intervento, se pianificata; altrimenti si ripiega su quella di apertura della scheda. */
    interventionDateLabel: string | null;
    createdAtLabel: string;
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

const buildDetailRow = (label: string, value: string) => `
                                                <tr>
                                                    <td style="padding: 3px 0; font-size: 13px; color: ${mutedColor}; white-space: nowrap;">${escapeHtml(label)}</td>
                                                    <td style="padding: 3px 0 3px 16px; font-size: 13px; font-weight: bold; color: ${textColor};">${escapeHtml(value)}</td>
                                                </tr>`;

const collectContacts = (data: InterventionEmailData) =>
    [data.labAddress, data.labPhone, data.labEmail]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

export const buildInterventionEmail = (data: InterventionEmailData): InterventionEmailContent => {
    const dateLabel = data.interventionDateLabel ?? data.createdAtLabel;
    const typeLabel = formatInterventionType(data.type);
    const contacts = collectContacts(data);

    const subject = `Riepilogo intervento del ${dateLabel} - ${data.labName}`;

    // Versione solo testo: dice le stesse cose dell'HTML, per i client che non lo mostrano.
    const text = [
        `Gentile ${data.customerName},`,
        `come da accordi le inviamo il riepilogo dell'intervento del ${dateLabel}.`,
        `Data: ${dateLabel}\nTipo: ${typeLabel}`,
        "Nel PDF allegato trova il dettaglio del lavoro svolto: le consigliamo di conservarlo per ogni futura necessità.",
        "Per qualsiasi chiarimento può rispondere a questa email o contattarci ai recapiti qui sotto: siamo a sua disposizione.",
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
                                <p style="margin: 0 0 20px 0;">come da accordi le inviamo il riepilogo dell'intervento del <strong>${escapeHtml(dateLabel)}</strong>.</p>
                                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px 0; background-color: #f7f8fa; border: 1px solid ${borderColor}; border-radius: 8px;">
                                    <tr>
                                        <td style="padding: 12px 16px;">
                                            <table role="presentation" cellpadding="0" cellspacing="0">${buildDetailRow("Data", dateLabel)}${buildDetailRow("Tipo", typeLabel)}
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin: 0 0 16px 0;">Nel PDF allegato trova il dettaglio del lavoro svolto: le consigliamo di conservarlo per ogni futura necessità.</p>
                                <p style="margin: 0 0 16px 0;">Per qualsiasi chiarimento può rispondere a questa email o contattarci ai recapiti qui sotto: siamo a sua disposizione.</p>
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
