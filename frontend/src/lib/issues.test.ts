import { describe, expect, it } from "vitest";
import { isCatchAllIssue } from "./issues";

describe("isCatchAllIssue", () => {
    it("riconosce la voce 'Altro' senza badare a maiuscole e spazi", () => {
        expect(isCatchAllIssue("Altro")).toBe(true);
        expect(isCatchAllIssue("  altro ")).toBe(true);
        expect(isCatchAllIssue("ALTRO")).toBe(true);
    });

    it("non confonde altre voci o valori assenti", () => {
        expect(isCatchAllIssue("Altro guasto")).toBe(false);
        expect(isCatchAllIssue("Schermo rotto")).toBe(false);
        expect(isCatchAllIssue(null)).toBe(false);
        expect(isCatchAllIssue(undefined)).toBe(false);
    });
});
