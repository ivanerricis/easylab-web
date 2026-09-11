import { describe, expect, it } from "vitest";
import { isPasswordCompliant, passwordMinLength, passwordRequirements } from "./passwordPolicy";

const unsatisfiedLabels = (password: string) =>
    passwordRequirements
        .filter((requirement) => !requirement.isSatisfied(password))
        .map((requirement) => requirement.label);

describe("passwordPolicy", () => {
    it("accetta una password che rispetta tutti i requisiti", () => {
        expect(isPasswordCompliant("segreta1!")).toBe(true);
        expect(unsatisfiedLabels("segreta1!")).toEqual([]);
    });

    /**
     * La checklist nel dialogo si accende requisito per requisito: ogni regola deve fallire
     * da sola, altrimenti l'utente vede spuntato qualcosa che il server poi rifiuta.
     */
    it("segnala ogni requisito mancante per conto proprio", () => {
        expect(unsatisfiedLabels("ab1!")).toEqual([`Almeno ${passwordMinLength} caratteri`]);
        expect(unsatisfiedLabels("abcdefgh!")).toEqual(["Almeno un numero"]);
        expect(unsatisfiedLabels("abcdefgh1")).toEqual(["Almeno un carattere speciale"]);
    });

    it("conta esattamente la lunghezza minima come sufficiente", () => {
        const password = "a1!".padEnd(passwordMinLength, "x");

        expect(password).toHaveLength(passwordMinLength);
        expect(isPasswordCompliant(password)).toBe(true);
        expect(isPasswordCompliant(password.slice(1))).toBe(false);
    });

    it("considera speciale anche uno spazio o una lettera accentata", () => {
        // Sono fuori da [A-Za-z0-9], come nella regola del backend.
        expect(isPasswordCompliant("password 1")).toBe(true);
        expect(isPasswordCompliant("passwordè1")).toBe(true);
    });

    it("rifiuta la password vuota", () => {
        expect(isPasswordCompliant("")).toBe(false);
        expect(unsatisfiedLabels("")).toHaveLength(passwordRequirements.length);
    });
});
