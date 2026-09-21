import { describe, expect, it } from "vitest";
import { insertIssue } from "../../test/db/fixtures";
import { createIssue, listIssues, updateIssueById } from "./issue";

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

describe("listIssues: ricerca, ordinamento e paginazione", () => {
    const findIds = async (params: Omit<Parameters<typeof listIssues>[0], "page" | "pageSize">) => {
        const result = await listIssues({ page: 1, pageSize: 100, ...params });

        if (Array.isArray(result)) {
            throw new Error("attesa una lista paginata");
        }

        return result.items.map((item) => item.id).sort((a, b) => a - b);
    };

    it("trova per descrizione, senza distinguere maiuscole e minuscole", async () => {
        const target = await insertIssue("Schermo Zefiro rotto");
        await insertIssue();

        expect(await findIds({ search: "zefiro" })).toEqual([target.id]);
        expect(await findIds({ search: "ZEFIRO" })).toEqual([target.id]);
    });

    it("un numero trova il guasto con quell'id, non quelli che lo contengono", async () => {
        const issues = [];
        for (let index = 0; index < 12; index += 1) {
            issues.push(await insertIssue());
        }

        expect(await findIds({ search: "1" })).toEqual([issues[0].id]);
    });

    it("ordina dal più recente se non si chiede altro", async () => {
        const oldest = await insertIssue();
        const newest = await insertIssue();

        const result = await listIssues({ page: 1, pageSize: 10 });

        expect(Array.isArray(result) ? [] : result.items.map((item) => item.id)).toEqual([newest.id, oldest.id]);
    });

    it("pagina i risultati e conta tutte le righe", async () => {
        const issues = [
            await insertIssue(),
            await insertIssue(),
            await insertIssue(),
            await insertIssue(),
            await insertIssue(),
        ];

        const secondPage = await listIssues({ page: 2, pageSize: 2 });
        const beyond = await listIssues({ page: 4, pageSize: 2 });

        // Dal più recente: 5 4 | 3 2 | 1
        expect(secondPage).toMatchObject({ totalItems: 5, items: [{ id: issues[2].id }, { id: issues[1].id }] });
        expect(beyond).toEqual({ items: [], totalItems: 5 });
    });

    it("senza paginazione restituisce l'elenco intero", async () => {
        await insertIssue();
        await insertIssue();

        const result = await listIssues({});

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
    });
});
