import { describe, expect, it } from "vitest";
import { insertIssue } from "../../test/db/fixtures";
import { createIssue, updateIssueById } from "./issue";

describe("createIssue: unicità della descrizione", () => {
    it("rifiuta una descrizione duplicata solo per maiuscole/minuscole", async () => {
        await insertIssue("Schermo rotto");

        await expect(createIssue({ description: "schermo rotto" })).rejects.toMatchObject({
            cause: { code: "23505" },
        });
    });

    it("accetta descrizioni distinte", async () => {
        await insertIssue("Schermo rotto");

        await expect(createIssue({ description: "Batteria da sostituire" })).resolves.toEqual([
            expect.objectContaining({ description: "Batteria da sostituire" }),
        ]);
    });

    // La rotta dei difetti non controlla più a mano il doppione della voce generica: si affida a
    // questo indice. Se un giorno sparisse, questi due test se ne accorgerebbero.
    it('rifiuta un secondo "altro" accanto ad "Altro", anche per rinomina', async () => {
        await insertIssue("Altro");
        const other = await insertIssue("Schermo rotto");

        await expect(createIssue({ description: "ALTRO" })).rejects.toMatchObject({ cause: { code: "23505" } });
        await expect(updateIssueById(other.id, { description: "altro" })).rejects.toMatchObject({
            cause: { code: "23505" },
        });
    });
});
