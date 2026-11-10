import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installConsoleFormat } from "./consoleFormat";

describe("installConsoleFormat", () => {
    const originals = { log: console.log, warn: console.warn, error: console.error };
    const written: string[] = [];

    beforeEach(() => {
        written.length = 0;
        console.log = console.warn = console.error = (text: string) => void written.push(text);
        installConsoleFormat();
    });

    afterEach(() => {
        Object.assign(console, originals);
        vi.restoreAllMocks();
    });

    it("antepone ora e livello a una riga di testo libero", () => {
        console.error("Arresto forzato");
        console.warn("Impostazioni non leggibili");
        console.log("Server running on port 3000");

        expect(written[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \| level=error \| Arresto forzato$/);
        expect(written[1]).toContain("| level=warn | Impostazioni non leggibili");
        expect(written[2]).toContain("| level=info | Server running on port 3000");
    });

    it("tiene lo stack dell'errore dopo il messaggio", () => {
        console.error("Backup non riuscito:", new Error("disco pieno"));

        expect(written[0]).toContain("| level=error | Backup non riuscito: Error: disco pieno");
        expect(written[0]).toContain("at ");
    });

    it("lascia com'è una riga che inizia già con un'ora", () => {
        const line = "2026-11-09T10:00:00.000Z | req=a1b2c3d4 | method=GET | path=/api/x | status=200";
        console.log(line);

        expect(written[0]).toBe(line);
    });
});
