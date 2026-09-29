import { describe, expect, it } from "vitest";
import { reportColumns } from "./report-columns";

describe("reportColumns", () => {
    /** Tolta la colonna "Stato", aperto o chiuso tornerebbe a dirlo solo il colore della riga. */
    it("la colonna Stato non si può nascondere dal menu Colonne", () => {
        expect(reportColumns.find((column) => column.key === "closed")).toMatchObject({
            header: "Stato",
            hideable: false,
        });
    });
});
