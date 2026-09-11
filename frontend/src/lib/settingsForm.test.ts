import { describe, expect, it } from "vitest";
import { isSettingsFormDirty } from "./settingsForm";

type EmailForm = { host: string; port: number; secure: boolean; password: string };

const saved: EmailForm = { host: "smtp.example.com", port: 587, secure: false, password: "" };

describe("isSettingsFormDirty", () => {
    it("è pulito quando il form coincide con l'ultimo stato salvato", () => {
        expect(isSettingsFormDirty({ ...saved }, saved, ["password"])).toBe(false);
    });

    it("è sporco quando cambia un campo qualsiasi", () => {
        expect(isSettingsFormDirty({ ...saved, port: 465 }, saved, ["password"])).toBe(true);
        expect(isSettingsFormDirty({ ...saved, secure: true }, saved, ["password"])).toBe(true);
    });

    /**
     * Il backend non restituisce mai le password: nel form salvato il campo è sempre vuoto,
     * quindi qualunque valore scritto è per forza una modifica da salvare.
     */
    it("considera una modifica qualunque segreto compilato", () => {
        expect(isSettingsFormDirty({ ...saved, password: "nuova" }, saved, ["password"])).toBe(true);
    });

    it("ignora un segreto fatto di soli spazi", () => {
        expect(isSettingsFormDirty({ ...saved, password: "   " }, saved, ["password"])).toBe(false);
    });

    it("esclude i segreti dal confronto con lo stato salvato", () => {
        // Anche se lo stato salvato avesse un valore nel segreto, non conta: il confronto
        // riguarda solo i campi che il server restituisce davvero.
        const savedWithSecret = { ...saved, password: "vecchia" };

        expect(isSettingsFormDirty({ ...saved, password: "" }, savedWithSecret, ["password"])).toBe(false);
    });

    it("senza chiavi segrete confronta tutti i campi", () => {
        expect(isSettingsFormDirty({ ...saved, password: "x" }, saved)).toBe(true);
        expect(isSettingsFormDirty({ ...saved }, saved)).toBe(false);
    });
});
