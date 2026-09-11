import type { CreateInterventionSubmitValues } from "@/components/dialogs/create/createInterventionDialog";
import type { EditInterventionSubmitValues } from "@/components/dialogs/edit/editInterventionDialog";
import type { InterventionCreateInput } from "@/lib/api";

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
    collaboratorId: values.collaboratorId,
    interventionDate: values.interventionDate,
    startTime: values.startTime,
    endTime: values.endTime,
});
