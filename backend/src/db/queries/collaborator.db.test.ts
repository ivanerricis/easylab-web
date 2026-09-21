import { describe, expect, it } from "vitest";
import { insertCollaborator } from "../../test/db/fixtures";
import { listCollaborators } from "./collaborator";

const findIds = async (params: Omit<Parameters<typeof listCollaborators>[0], "page" | "pageSize">) => {
    const result = await listCollaborators({ page: 1, pageSize: 100, ...params });

    if (Array.isArray(result)) {
        throw new Error("attesa una lista paginata");
    }

    return result.items.map((item) => item.id).sort((a, b) => a - b);
};

const search = (text: string) => findIds({ search: text });

describe("listCollaborators: ricerca libera", () => {
    it.each([
        ["il nome", { firstName: "Zefirino" }],
        ["il cognome", { firstName: "Mario", lastName: "Zefirelli" }],
        ["il telefono", { firstName: "Mario", phoneNumber: "333 999 0001" }],
    ])("trova per %s", async (label, values) => {
        const target = await insertCollaborator(values);
        await insertCollaborator();

        const text = label.includes("telefono") ? "999 0001" : "zefir";
        expect(await search(text)).toEqual([target.id]);
    });

    it("non distingue maiuscole e minuscole", async () => {
        const target = await insertCollaborator({ firstName: "ZEFIRO" });

        expect(await search("zefiro")).toEqual([target.id]);
    });

    it("un numero trova il collaboratore con quell'id, non quelli che lo contengono", async () => {
        const collaborators = [];
        for (let index = 0; index < 12; index += 1) {
            collaborators.push(await insertCollaborator());
        }

        expect(await search("1")).toEqual([collaborators[0].id]);
    });

    it("una ricerca senza corrispondenze non trova niente e conta zero", async () => {
        await insertCollaborator({ firstName: "Qualcosa" });

        const result = await listCollaborators({ page: 1, pageSize: 10, search: "nessuna-corrispondenza" });

        expect(result).toEqual({ items: [], totalItems: 0 });
    });

    it("il totale con la ricerca conta tutte le corrispondenze, non solo la pagina", async () => {
        for (let index = 0; index < 5; index += 1) {
            await insertCollaborator({ firstName: "Zefiro" });
        }
        await insertCollaborator();

        const result = await listCollaborators({ page: 2, pageSize: 2, search: "zefiro" });

        expect(result).toMatchObject({ totalItems: 5 });
        expect(Array.isArray(result) ? [] : result.items).toHaveLength(2);
    });
});

describe("listCollaborators: ordinamento e paginazione", () => {
    it("ordina sempre per nome e cognome", async () => {
        const bianchi = await insertCollaborator({ firstName: "Anna", lastName: "Bianchi" });
        const rossi = await insertCollaborator({ firstName: "Anna", lastName: "Rossi" });
        const senzaCognome = await insertCollaborator({ firstName: "Bruno" });

        const result = await listCollaborators({ page: 1, pageSize: 10 });

        expect(Array.isArray(result) ? [] : result.items.map((item) => item.id)).toEqual([
            bianchi.id,
            rossi.id,
            senzaCognome.id,
        ]);
    });

    it("pagina i risultati e conta tutte le righe", async () => {
        const collaborators = [
            await insertCollaborator({ firstName: "A" }),
            await insertCollaborator({ firstName: "B" }),
            await insertCollaborator({ firstName: "C" }),
            await insertCollaborator({ firstName: "D" }),
            await insertCollaborator({ firstName: "E" }),
        ];

        const secondPage = await listCollaborators({ page: 2, pageSize: 2 });
        const beyond = await listCollaborators({ page: 4, pageSize: 2 });

        expect(secondPage).toMatchObject({
            totalItems: 5,
            items: [{ id: collaborators[2].id }, { id: collaborators[3].id }],
        });
        expect(beyond).toEqual({ items: [], totalItems: 5 });
    });

    it("senza paginazione restituisce l'elenco intero", async () => {
        await insertCollaborator();
        await insertCollaborator();

        const result = await listCollaborators({});

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
    });
});
