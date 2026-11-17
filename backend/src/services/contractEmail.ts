import type { ContractType } from "../db/schema";
import { collectLabContacts, escapeHtml, renderLabEmailHtml, type LabContacts } from "./labEmailLayout";

/**
 * L'email che manda al cliente il contratto firmato (il PDF caricato a mano). Come per il
 * riepilogo dell'intervento (`interventionEmail.ts`), il numero interno del contratto non
 * compare: il cliente lo riconosce dal bene coperto e dalla data di inizio.
 */
export type ContractEmailData = LabContacts & {
    customerName: string;
    type: ContractType;
    /** Il bene coperto dal contratto, così come scritto nel contratto. */
    device: string;
    /** La data di inizio come YYYY-MM-DD: la usa anche la rotta per il nome dell'allegato. */
    startDate: string;
    /** Identificativo dell'immagine allegata inline: null quando il logo non è disponibile. */
    logoCid: string | null;
};

const contractNameByType: Record<ContractType, string> = {
    assistance: "contratto di assistenza",
    rental: "contratto di noleggio",
};

// Per esteso, perché sta dentro una frase; il giorno non ha fuso (vedi `interventionEmail.ts`).
const dayFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "UTC" });

const formatDay = (day: string) => dayFormatter.format(new Date(`${day}T00:00:00Z`));

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Il nome dell'allegato: per data di inizio, come il cliente archivia i documenti. */
export const signedContractAttachmentName = (startDate: string) => `contratto-firmato-${startDate}.pdf`;

export const buildContractEmail = (data: ContractEmailData) => {
    const contractName = contractNameByType[data.type];
    const startLabel = formatDay(data.startDate);
    const device = data.device.trim();
    const contacts = collectLabContacts(data);

    const subject = `${capitalize(contractName)} firmato - ${data.labName}`;

    const text = [
        `Gentile ${data.customerName},`,
        `in allegato trova la copia firmata del ${contractName} per ${device}, in vigore dal ${startLabel}. Le consigliamo di conservarla.`,
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
            `in allegato trova la copia firmata del ${contractName} per <strong>${escapeHtml(device)}</strong>, in vigore dal <strong>${escapeHtml(startLabel)}</strong>. Le consigliamo di conservarla.`,
            "Per qualsiasi domanda può rispondere a questa email o contattarci ai recapiti qui sotto.",
            "Grazie per la fiducia.",
            `Cordiali saluti,<br /><strong>${escapeHtml(data.labName)}</strong>`,
        ],
        contacts,
    });

    return { subject, text, html };
};
