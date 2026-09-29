import { describe, expect, it } from "vitest";
import { parseEuroAmount } from "./euroAmount";

describe("parseEuroAmount", () => {
    it("legge la virgola italiana e il punto", () => {
        expect(parseEuroAmount("12,50")).toBe(12.5);
        expect(parseEuroAmount("12.5")).toBe(12.5);
        expect(parseEuroAmount(" 80 ")).toBe(80);
        expect(parseEuroAmount("0,5")).toBe(0.5);
        expect(parseEuroAmount(",5")).toBe(0.5);
        expect(parseEuroAmount("12,")).toBe(12);
    });

    it("il campo vuoto è null: cosa voglia dire lo decide il modulo", () => {
        expect(parseEuroAmount("")).toBeNull();
        expect(parseEuroAmount("   ")).toBeNull();
    });

    it("un testo che non è un importo è NaN, non zero", () => {
        for (const value of ["abc", "12a", "1.234", "1.234,56", "12,5,0", "€ 12", "1e3", "."]) {
            expect(parseEuroAmount(value)).toBeNaN();
        }
    });

    it("legge il segno meno, perché il modulo possa dire che il prezzo non può essere negativo", () => {
        expect(parseEuroAmount("-5")).toBe(-5);
    });
});
