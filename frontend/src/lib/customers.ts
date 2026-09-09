import type { CustomerDto } from "@/types/dtos";

/**
 * Come il cliente viene scritto nella casella del dialogo: "Nome Cognome - telefono".
 *
 * Stava in tre copie identiche — il dialogo, la pagina Report e la Dashboard — e le tre
 * copie devono per forza restare uguali, perché è la stringa con cui il testo digitato viene
 * poi ricercato fra i clienti. Una sola definizione è l'unico modo per garantirlo.
 */
export const formatCustomerOption = (
    firstName: string,
    lastName: string | null,
    phoneNumber: string | null,
    phoneNumberSecondary: string | null
) => {
    const fullName = `${firstName} ${lastName ?? ""}`.trim();
    return `${fullName} - ${phoneNumber?.trim() || phoneNumberSecondary?.trim() || "N/D"}`;
};

/**
 * Confronto "come lo intende una persona": senza accenti, senza maiuscole e senza spazi
 * doppi, così "D'Angelo  Anna" e "d'angelo anna" sono lo stesso cliente. `\p{Diacritic}`
 * dice esplicitamente cosa si sta togliendo, dove prima c'era un intervallo di codici.
 */
const normalizeCustomerText = (value: string) =>
    value
        .normalize("NFKD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

const getCustomerFullName = (firstName: string, lastName: string | null) => `${firstName} ${lastName ?? ""}`.trim();

export const resolveSelectedCustomer = (customers: CustomerDto[], rawValue: string) => {
    const normalizedRawValue = normalizeCustomerText(rawValue);
    const rawNameOnly = normalizeCustomerText(rawValue.split(" - ")[0] ?? rawValue);

    const exactMatches = customers.filter(
        (customer) =>
            normalizeCustomerText(
                formatCustomerOption(
                    customer.firstName,
                    customer.lastName,
                    customer.phoneNumber,
                    customer.phoneNumberSecondary
                )
            ) === normalizedRawValue
    );

    if (exactMatches.length === 1) {
        return exactMatches[0];
    }

    if (exactMatches.length > 1) {
        throw new Error("Il cliente selezionato non è univoco. Seleziona il nominativo completo.");
    }

    const nameMatches = customers.filter(
        (customer) => normalizeCustomerText(getCustomerFullName(customer.firstName, customer.lastName)) === rawNameOnly
    );

    if (nameMatches.length === 1) {
        return nameMatches[0];
    }

    if (nameMatches.length > 1) {
        throw new Error("Esistono più clienti con lo stesso nome. Seleziona quello completo con il telefono.");
    }

    return null;
};
