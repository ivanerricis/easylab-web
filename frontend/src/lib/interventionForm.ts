import type { CreateInterventionSubmitValues } from "@/components/dialogs/create/createInterventionDialog";
import type { EditInterventionSubmitValues } from "@/components/dialogs/edit/editInterventionDialog";
import type { InterventionCreateInput } from "@/lib/api";
import { getInterventionValidationError, isOnSiteInterventionType, type InterventionField } from "@/lib/interventions";
import type { InterventionStatus, InterventionType } from "@/types/dtos";

/**
 * I campi dell'intervento come li tiene il modulo (testo, come arrivano dai controlli), comuni ai
 * dialoghi di creazione e modifica. I due dialoghi avevano ciascuno la sua copia di stato,
 * validazione, campi e payload, e ogni modifica andava fatta "nei due dialoghi" (CHANGELOG del
 * 2026-09-15 e 09-16); le copie si erano già allontanate — il suggerimento nella descrizione
 * c'era solo in creazione, e il collaboratore si controllava in due modi diversi.
 */
export type InterventionFormState = {
    type: InterventionType;
    status: InterventionStatus;
    description: string;
    problem: string;
    note: string;
    price: string;
    paid: boolean;
    toInvoice: boolean;
    collaboratorId: string;
    interventionDate: string;
    startTime: string;
    endTime: string;
};

export type InterventionFieldErrors = Partial<Record<"collaboratorId" | "price" | InterventionField, string>>;

export const emptyInterventionFormState = (interventionDate: string): InterventionFormState => ({
    type: "consegna_materiale",
    status: "programmato",
    description: "",
    problem: "",
    note: "",
    price: "",
    paid: false,
    toInvoice: false,
    collaboratorId: "",
    interventionDate,
    startTime: "",
    endTime: "",
});

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
export const interventionFieldOrder = [
    "collaboratorId",
    "interventionDate",
    "startTime",
    "endTime",
    "problem",
    "description",
    "price",
] as const;

const parsePrice = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * Tutti gli errori dei campi dell'intervento in un colpo solo, ciascuno accanto al proprio campo.
 * Il cliente, che c'è solo in creazione, lo controlla il suo dialogo.
 */
export const validateInterventionForm = (values: InterventionFormState): InterventionFieldErrors => {
    const errors: InterventionFieldErrors = {};
    const collaboratorId = Number(values.collaboratorId);

    if (values.collaboratorId === "" || !Number.isInteger(collaboratorId) || collaboratorId <= 0) {
        errors.collaboratorId = "Seleziona un collaboratore";
    }

    const price = parsePrice(values.price);

    if (price != null && (!Number.isFinite(price) || price < 0)) {
        errors.price = "Il prezzo deve essere maggiore o uguale a zero";
    }

    const validationError = getInterventionValidationError(values);

    if (validationError) {
        errors[validationError.field] = validationError.message;
    }

    return errors;
};

/**
 * I campi dell'intervento da consegnare a chi salva, a modulo già validato: problema e orari
 * esistono solo per gli interventi in sede o da remoto.
 */
export const toInterventionSubmitFields = (values: InterventionFormState) => {
    const isOnSite = isOnSiteInterventionType(values.type);

    return {
        type: values.type,
        status: values.status,
        description: values.description.trim() || null,
        problem: isOnSite ? values.problem.trim() : null,
        note: values.note.trim() || null,
        price: parsePrice(values.price),
        paid: values.paid,
        toInvoice: values.toInvoice,
        collaboratorId: Number(values.collaboratorId),
        interventionDate: values.interventionDate,
        startTime: isOnSite ? values.startTime || null : null,
        endTime: isOnSite ? values.endTime || null : null,
    };
};

/**
 * I campi dell'intervento da mandare a `createIntervention`, una volta risolto il cliente.
 *
 * Stava in due copie — la pagina Interventi e la Dashboard, che crea anche dal calendario — e
 * quando è arrivata la nota libera nessuna delle due l'ha passata: il dialogo la raccoglieva e
 * il salvataggio la buttava via senza dirlo. È lo stesso difetto che `toReportUpdatePayload`
 * racconta per i report, e la stessa cura: nel payload i campi sono tutti facoltativi, quindi
 * dimenticarne uno non rompe la compilazione.
 */
export const toInterventionCreatePayload = (
    values: CreateInterventionSubmitValues,
    customerId: number
): InterventionCreateInput => ({
    type: values.type,
    status: values.status,
    description: values.description,
    problem: values.problem,
    note: values.note,
    price: values.price,
    paid: values.paid,
    toInvoice: values.toInvoice,
    customerId,
    collaboratorId: values.collaboratorId,
    interventionDate: values.interventionDate,
    startTime: values.startTime,
    endTime: values.endTime,
});

/**
 * I campi dell'intervento da mandare a `updateIntervention`. Anche qui le copie erano due, la
 * scheda e l'elenco, e solo la scheda passava la nota: modificandola dall'elenco la modifica
 * andava persa (il PUT è parziale, quindi restava la nota di prima).
 */
export const toInterventionUpdatePayload = (
    values: EditInterventionSubmitValues
): Partial<InterventionCreateInput> => ({
    type: values.type,
    status: values.status,
    description: values.description,
    problem: values.problem,
    note: values.note,
    price: values.price,
    paid: values.paid,
    toInvoice: values.toInvoice,
    collaboratorId: values.collaboratorId,
    interventionDate: values.interventionDate,
    startTime: values.startTime,
    endTime: values.endTime,
});
