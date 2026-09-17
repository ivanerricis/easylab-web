import { describe, expect, it } from "vitest";
import { insertIssue } from "../../test/db/fixtures";
import { createIssue } from "./issue";

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
});
