import { describe, expect, it } from "vitest";
import { getMonthKey, getMonthLabel, getMonthLength, getMonthShortLabel, shiftMonthKey } from "./monthKey";

describe("getMonthKey", () => {
    it("scrive il mese a due cifre, dall'ora locale", () => {
        expect(getMonthKey(new Date(2026, 8, 11))).toBe("2026-09");
        expect(getMonthKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01");
        expect(getMonthKey(new Date(2025, 11, 31, 23, 59))).toBe("2025-12");
    });
});

describe("shiftMonthKey", () => {
    it("sposta avanti e indietro dentro lo stesso anno", () => {
        expect(shiftMonthKey("2026-09", -1)).toBe("2026-08");
        expect(shiftMonthKey("2026-09", 1)).toBe("2026-10");
        expect(shiftMonthKey("2026-09", 0)).toBe("2026-09");
    });

    /** La freccia "Mese precedente" a gennaio deve arrivare al dicembre dell'anno prima. */
    it("attraversa il cambio d'anno in entrambe le direzioni", () => {
        expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
        expect(shiftMonthKey("2025-12", 1)).toBe("2026-01");
        expect(shiftMonthKey("2026-03", -15)).toBe("2024-12");
        expect(shiftMonthKey("2026-11", 14)).toBe("2028-01");
    });
});

describe("getMonthLength", () => {
    it("conosce i mesi da 30 e da 31 giorni", () => {
        expect(getMonthLength("2026-01")).toBe(31);
        expect(getMonthLength("2026-04")).toBe(30);
        expect(getMonthLength("2026-08")).toBe(31);
        expect(getMonthLength("2026-09")).toBe(30);
        expect(getMonthLength("2026-12")).toBe(31);
    });

    /** Febbraio è il mese su cui il confronto "fino allo stesso giorno" sbaglierebbe per primo. */
    it("conta febbraio negli anni bisestili, compresi quelli dei secoli", () => {
        expect(getMonthLength("2026-02")).toBe(28);
        expect(getMonthLength("2028-02")).toBe(29);
        expect(getMonthLength("2100-02")).toBe(28);
        expect(getMonthLength("2000-02")).toBe(29);
    });
});

describe("getMonthLabel", () => {
    it("scrive mese e anno in italiano", () => {
        expect(getMonthLabel("2026-09")).toBe("settembre 2026");
        expect(getMonthLabel("2025-12")).toBe("dicembre 2025");
    });

    it("lascia com'è una chiave che non è un mese, invece di scrivere 'Invalid Date'", () => {
        for (const chiave of ["2026-13", "2026-00", "settembre", ""]) {
            expect(getMonthLabel(chiave), chiave).toBe(chiave);
        }
    });
});

describe("getMonthShortLabel", () => {
    it("usa l'abbreviazione italiana del mese", () => {
        expect(getMonthShortLabel("2026-09")).toBe("set");
        expect(getMonthShortLabel("2026-01")).toBe("gen");
    });
});
