/**
 * La cornice comune delle email che il laboratorio manda ai clienti (riepilogo dell'intervento,
 * contratto firmato): intestazione con logo e nome, il corpo, i recapiti in fondo. Ogni email
 * decide solo cosa dire; l'aspetto resta lo stesso, così il cliente le riconosce.
 */
export type LabContacts = {
    labName: string;
    labEmail: string;
    labAddress: string;
    labPhone: string;
};

export const escapeHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const borderColor = "#e2e5ea";
const mutedColor = "#5b6672";
const textColor = "#1f2733";

/** Indirizzo, telefono ed email del laboratorio, nell'ordine in cui compaiono, senza i vuoti. */
export const collectLabContacts = (data: LabContacts) =>
    [data.labAddress, data.labPhone, data.labEmail]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

type LabEmailHtmlInput = {
    labName: string;
    /** Identificativo dell'immagine allegata inline: null quando il logo non è disponibile. */
    logoCid: string | null;
    /** I paragrafi del corpo, già in HTML: chi chiama ne ha già escapato le parti variabili. */
    paragraphsHtml: string[];
    contacts: string[];
};

/**
 * HTML da email: tabelle annidate, stili in linea e nessun asset esterno, perché è l'unica
 * struttura che i client di posta (Outlook in testa) rendono allo stesso modo.
 */
export const renderLabEmailHtml = ({ labName, logoCid, paragraphsHtml, contacts }: LabEmailHtmlInput) => {
    const logoCell = logoCid
        ? `<img src="cid:${logoCid}" width="44" height="44" alt="${escapeHtml(labName)}" style="display: block; width: 44px; height: 44px; border: 1px solid ${borderColor}; border-radius: 6px; object-fit: cover;" />`
        : "";
    const lastIndex = paragraphsHtml.length - 1;
    const paragraphs = paragraphsHtml
        .map((paragraph, index) => `<p style="margin: 0 0 ${index === lastIndex ? 20 : 16}px 0;">${paragraph}</p>`)
        .join("\n                                ");

    return `<!doctype html>
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
                                        <td style="font-size: 17px; font-weight: bold; color: ${textColor};">${escapeHtml(labName)}</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 28px 28px 12px 28px; font-size: 15px; line-height: 1.6;">
                                ${paragraphs}
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
};
