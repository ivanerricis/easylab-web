import type { CollaboratorSubmitValues } from "@/components/dialogs/create/createCollaboratorDialog";
import type { TechnicianSubmitValues } from "@/components/dialogs/create/createTechnicianDialog";
import { trimOrNull } from "@/lib/utils";

/**
 * Dai valori dei dialoghi al corpo della richiesta, per collaboratori e tecnici. Li usano
 * l'elenco e la scheda di ciascuno, che modificano la stessa persona e devono mandare lo
 * stesso corpo (il cliente ha il suo in `lib/customers.ts`).
 */
export const toCollaboratorPayload = (values: CollaboratorSubmitValues) => ({
    firstName: values.firstName.trim(),
    lastName: trimOrNull(values.lastName),
    phoneNumber: trimOrNull(values.phoneNumber),
});

export const toTechnicianPayload = (values: TechnicianSubmitValues) => ({
    firstName: values.firstName.trim(),
    lastName: trimOrNull(values.lastName),
    phoneNumber: trimOrNull(values.phoneNumber),
    vatNumber: trimOrNull(values.vatNumber),
});

/**
 * "Nome Cognome" di un cliente, collaboratore o tecnico: il cognome è facoltativo.
 *
 * Era ricostruito a mano in una dozzina di punti, e le copie si erano già allontanate: tre
 * messaggi di conferma non toglievano lo spazio finale, e senza cognome chiedevano "Sei sicuro
 * di voler eliminare il tecnico Mario ?".
 */
export const formatPersonName = (person: { firstName: string; lastName: string | null }) =>
    `${person.firstName} ${person.lastName ?? ""}`.trim();
