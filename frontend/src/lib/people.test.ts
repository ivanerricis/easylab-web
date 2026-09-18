import { describe, expect, it } from "vitest";
import { formatPersonName } from "./people";

describe("formatPersonName", () => {
    it("unisce nome e cognome", () => {
        expect(formatPersonName({ firstName: "Mario", lastName: "Rossi" })).toBe("Mario Rossi");
    });

    // Tre conferme di eliminazione lo costruivano a mano senza `trim`, e senza cognome chiedevano
    // "Sei sicuro di voler eliminare il tecnico Mario ?".
    it("senza cognome non lascia lo spazio in fondo", () => {
        expect(`${formatPersonName({ firstName: "Mario", lastName: null })}?`).toBe("Mario?");
    });
});
