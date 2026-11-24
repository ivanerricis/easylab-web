import type { ContractSubmitValues } from "@/components/dialogs/create/createContractDialog";
import type { ContractCreateInput, ContractUpdateInput } from "@/lib/api";
import { defaultAssistancePackage, maxContractMonths, supportTermMonths } from "@/lib/contracts";
import { trimOrNull } from "@/lib/utils";
import type { AssistancePackage, ContractStatus, ContractType } from "@/types/dtos";

/**
 * I campi del contratto come li tiene il modulo (testo, come arrivano dai controlli). I clienti e i
 * fornitori sono le etichette scritte nelle caselle: l'id si risolve a parte, vedi il dialogo.
 */
export type ContractFormState = {
    type: ContractType;
    status: ContractStatus;
    /** I mesi come testo ("12"): lo scrive anche a mano chi non vuole una scorciatoia. */
    termMonths: string;
    /** Come `termMonths`, per il periodo di fatturazione del noleggio (ignorato per l'assistenza). */
    billingMonths: string;
    /** Gli id dei dispositivi del cliente coperti: facoltativi, anche più d'uno. */
    deviceIds: number[];
    note: string;
    startDate: string;
    customer: string;
    provider: string;
    /** La chiave del pacchetto del listino; ore e prezzo le copia il server. */
    package: AssistancePackage;
};

export type ContractFormField = "customer" | "provider" | "startDate" | "termMonths" | "billingMonths" | "package";

export type ContractFieldErrors = Partial<Record<ContractFormField, string>>;

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
export const contractFieldOrder = [
    "customer",
    "provider",
    "startDate",
    "termMonths",
    "billingMonths",
    "package",
] as const;

/** Mesi interi da 1 a `maxContractMonths`, scritti come testo. */
const isValidMonths = (value: string) =>
    /^[0-9]+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= maxContractMonths;

const monthsError = `Indica un numero di mesi da 1 a ${maxContractMonths}`;

/** Un pacchetto Supporto dura sempre 12 mesi: il server lo impone, il modulo lo anticipa. */
export const isSupportTermValid = (termMonths: string) => Number(termMonths) === supportTermMonths;

export const emptyContractFormState = (startDate: string, customer = ""): ContractFormState => ({
    type: "assistance",
    status: "active",
    termMonths: "12",
    billingMonths: "3",
    deviceIds: [],
    note: "",
    startDate,
    customer,
    provider: "",
    package: defaultAssistancePackage,
});

/**
 * Gli errori dei campi del contratto, ciascuno accanto al proprio. Cliente e fornitore li controlla
 * il dialogo, perché richiedono di risolvere il nome in un id. Il Supporto, che dura sempre
 * 12 mesi, lo sa solo il listino: `isSupportPackage` dice se il pacchetto scelto lo è.
 */
export const validateContractForm = (
    values: ContractFormState,
    { isSupportPackage = false }: { isSupportPackage?: boolean } = {}
): ContractFieldErrors => {
    const errors: ContractFieldErrors = {};

    if (values.customer.trim() === "") {
        errors.customer = "Seleziona un cliente";
    }

    if (values.provider.trim() === "") {
        errors.provider = "Seleziona un fornitore";
    }

    if (values.startDate.trim() === "") {
        errors.startDate = "Seleziona la data di inizio";
    }

    if (!isValidMonths(values.termMonths)) {
        errors.termMonths = monthsError;
    } else if (values.type === "assistance" && isSupportPackage && !isSupportTermValid(values.termMonths)) {
        errors.termMonths = "Il pacchetto Supporto dura sempre 12 mesi";
    }

    if (values.type === "rental" && !isValidMonths(values.billingMonths)) {
        errors.billingMonths = monthsError;
    }

    return errors;
};

/** I valori da consegnare a chi salva, a modulo validato e con cliente e fornitore già risolti. */
export const toContractSubmitValues = (
    values: ContractFormState,
    customerId: number,
    providerId: number,
    /** Già filtrati sui dispositivi del cliente risolto: vedi il dialogo. */
    deviceIds: number[] = values.deviceIds
): ContractSubmitValues => ({
    type: values.type,
    status: values.status,
    termMonths: Number(values.termMonths),
    billingMonths: values.type === "rental" ? Number(values.billingMonths) : null,
    deviceIds,
    note: trimOrNull(values.note),
    startDate: values.startDate,
    customerId,
    providerId,
    assistance: values.type === "assistance" ? { package: values.package } : null,
});

/** I campi comuni a creazione e modifica: tutto tranne il tipo, che non si cambia. */
const toContractBody = (values: ContractSubmitValues) => ({
    status: values.status,
    termMonths: values.termMonths,
    // Il periodo di fatturazione solo per il noleggio: il server lo vieta all'assistenza.
    ...(values.billingMonths != null ? { billingMonths: values.billingMonths } : {}),
    deviceIds: values.deviceIds,
    note: values.note,
    startDate: values.startDate,
    customerId: values.customerId,
    providerId: values.providerId,
    // L'`assistance` si manda solo per l'assistenza: il server lo vuole se e solo se il contratto lo è.
    ...(values.assistance ? { assistance: values.assistance } : {}),
});

export const toContractCreatePayload = (values: ContractSubmitValues): ContractCreateInput => ({
    type: values.type,
    ...toContractBody(values),
});

export const toContractUpdatePayload = (values: ContractSubmitValues): ContractUpdateInput => toContractBody(values);
