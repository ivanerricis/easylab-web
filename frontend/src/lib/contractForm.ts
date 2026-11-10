import type { ContractSubmitValues } from "@/components/dialogs/create/createContractDialog";
import type { ContractCreateInput, ContractUpdateInput } from "@/lib/api";
import { maxContractMonths, packageHours } from "@/lib/contracts";
import { trimOrNull } from "@/lib/utils";
import type { AssistanceType, ContractStatus, ContractType } from "@/types/dtos";

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
    device: string;
    note: string;
    startDate: string;
    customer: string;
    provider: string;
    assistanceType: AssistanceType;
    /** Le ore incluse come testo ("10"); vuoto per il full time, che non ne ha. */
    includedHours: string;
};

export type ContractFormField =
    "customer" | "provider" | "device" | "startDate" | "termMonths" | "billingMonths" | "includedHours";

export type ContractFieldErrors = Partial<Record<ContractFormField, string>>;

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
export const contractFieldOrder = [
    "customer",
    "provider",
    "startDate",
    "termMonths",
    "billingMonths",
    "device",
    "includedHours",
] as const;

/** Mesi interi da 1 a `maxContractMonths`, scritti come testo. */
const isValidMonths = (value: string) =>
    /^[0-9]+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= maxContractMonths;

const monthsError = `Indica un numero di mesi da 1 a ${maxContractMonths}`;

/** Le ore con cui parte un pacchetto appena scelto: la prima fra quelle ammesse, nessuna per il full time. */
export const defaultIncludedHours = (assistanceType: AssistanceType) => {
    const [first] = packageHours[assistanceType];

    return first == null ? "" : String(first);
};

export const emptyContractFormState = (startDate: string, customer = ""): ContractFormState => ({
    type: "assistance",
    status: "active",
    termMonths: "12",
    billingMonths: "3",
    device: "",
    note: "",
    startDate,
    customer,
    provider: "",
    assistanceType: "remote",
    includedHours: defaultIncludedHours("remote"),
});

/**
 * Gli errori dei campi del contratto, ciascuno accanto al proprio. Cliente e fornitore li controlla
 * il dialogo, perché richiedono di risolvere il nome in un id. Per l'assistenza le ore devono
 * essere una di quelle del pacchetto: il menu non ne offre altre, ma il server le riapplica comunque.
 */
export const validateContractForm = (values: ContractFormState): ContractFieldErrors => {
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
    }

    if (values.type === "rental" && !isValidMonths(values.billingMonths)) {
        errors.billingMonths = monthsError;
    }

    if (values.device.trim() === "") {
        errors.device = "Indica il dispositivo";
    }

    if (values.type === "assistance" && values.assistanceType !== "full_time") {
        const allowed = packageHours[values.assistanceType].map(String);

        if (!allowed.includes(values.includedHours)) {
            errors.includedHours = "Seleziona le ore incluse nel pacchetto";
        }
    }

    return errors;
};

/** I valori da consegnare a chi salva, a modulo validato e con cliente e fornitore già risolti. */
export const toContractSubmitValues = (
    values: ContractFormState,
    customerId: number,
    providerId: number
): ContractSubmitValues => ({
    type: values.type,
    status: values.status,
    termMonths: Number(values.termMonths),
    billingMonths: values.type === "rental" ? Number(values.billingMonths) : null,
    device: values.device.trim(),
    note: trimOrNull(values.note),
    startDate: values.startDate,
    customerId,
    providerId,
    assistance:
        values.type === "assistance"
            ? {
                  assistanceType: values.assistanceType,
                  includedHours: values.assistanceType === "full_time" ? null : Number(values.includedHours),
              }
            : null,
});

/** I campi comuni a creazione e modifica: tutto tranne il tipo, che non si cambia. */
const toContractBody = (values: ContractSubmitValues) => ({
    status: values.status,
    termMonths: values.termMonths,
    // Il periodo di fatturazione solo per il noleggio: il server lo vieta all'assistenza.
    ...(values.billingMonths != null ? { billingMonths: values.billingMonths } : {}),
    device: values.device,
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
