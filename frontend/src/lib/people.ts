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
