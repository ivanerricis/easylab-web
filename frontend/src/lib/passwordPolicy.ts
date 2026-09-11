/**
 * Requisiti delle password, in copia di quelli applicati dal backend
 * (backend/src/services/passwordPolicy.ts).
 *
 * La duplicazione è voluta: il controllo che conta resta quello del server, questo serve
 * solo a dire all'utente cosa manca prima di inviare il form, invece di fargli scoprire
 * dopo il salvataggio che la password non andava bene. Se cambiano i requisiti vanno
 * modificati entrambi i file.
 */

export const passwordMinLength = 8;

export type PasswordRequirement = {
    label: string;
    isSatisfied: (password: string) => boolean;
};

export const passwordRequirements: PasswordRequirement[] = [
    {
        label: `Almeno ${passwordMinLength} caratteri`,
        isSatisfied: (password) => password.length >= passwordMinLength,
    },
    { label: "Almeno un numero", isSatisfied: (password) => /\d/.test(password) },
    { label: "Almeno un carattere speciale", isSatisfied: (password) => /[^A-Za-z0-9]/.test(password) },
];

export const passwordRequirementsHint = "Almeno 8 caratteri, con almeno un numero e un carattere speciale";

export const isPasswordCompliant = (password: string): boolean =>
    passwordRequirements.every((requirement) => requirement.isSatisfied(password));
