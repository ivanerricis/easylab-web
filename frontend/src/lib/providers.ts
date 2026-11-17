import type { ProviderSubmitValues } from "@/components/dialogs/create/createProviderDialog";
import { trimOrNull } from "@/lib/utils";
import type { ProviderDto } from "@/types/dtos";
import { formatPersonName } from "@/lib/people";

/**
 * Dai valori del dialogo al corpo della richiesta: il referente (nome e cognome) è facoltativo e
 * vuoto diventa `null`; ragione sociale, email e telefono sono obbligatori e viaggiano ripuliti.
 * Lo usano l'elenco e la scheda del fornitore, che modificano lo stesso fornitore.
 */
export const toProviderPayload = (values: ProviderSubmitValues) => ({
    providerName: values.providerName.trim(),
    firstName: trimOrNull(values.firstName),
    lastName: trimOrNull(values.lastName),
    email: values.email.trim(),
    phoneNumber: values.phoneNumber.trim(),
    logoDataUrl: values.logoDataUrl,
});

/** Il referente del fornitore ("Nome Cognome"), o `-` se non è indicato. */
export const formatProviderContact = (provider: Pick<ProviderDto, "firstName" | "lastName">) =>
    provider.firstName ? formatPersonName({ firstName: provider.firstName, lastName: provider.lastName }) : "-";
