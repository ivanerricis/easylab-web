import { describe, expect, it } from "vitest";
import { insertTechnician } from "../../test/db/fixtures";
import { listTechnicians } from "./technician";

const findIds = async (params: Omit<Parameters<typeof listTechnicians>[0], "page" | "pageSize">) => {
    const result = await listTechnicians({ page: 1, pageSize: 100, ...params });

    if (Array.isArray(result)) {
        throw new Error("attesa una lista paginata");
    }

    return result.items.map((item) => item.id).sort((a, b) => a - b);
};

const search = (text: string) => findIds({ search: text });

describe("listTechnicians: ricerca libera", () => {
    it.each([
        ["il nome", { firstName: "Zefirino" }],
        ["il cognome", { firstName: "Mario", lastName: "Zefirelli" }],
        ["il telefono", { firstName: "Mario", phoneNumber: "333 999 0001" }],
        ["la partita IVA", { firstName: "Mario", vatNumber: "IT99900011" }],
    ])("trova per %s", async (label, values) => {
        const target = await insertTechnician(values);
        await insertTechnician();

        const text = label.includes("telefono") ? "999 0001" : label.includes("IVA") ? "99900011" : "zefir";
        expect(await search(text)).toEqual([target.id]);
    });

    it("non distingue maiuscole e minuscole", async () => {
        const target = await insertTechnician({ firstName: "ZEFIRO" });

        expect(await search("zefiro")).toEqual([target.id]);
    });

    it("un numero trova il tecnico con quell'id, non quelli che lo contengono", async () => {
        const technicians = [];
        for (let index = 0; index < 12; index += 1) {
            technicians.push(await insertTechnician());
        }

        expect(await search("1")).toEqual([technicians[0].id]);
    });

    it("una ricerca senza corrispondenze non trova niente e conta zero", async () => {
        await insertTechnician({ firstName: "Qualcosa" });

        const result = await listTechnicians({ page: 1, pageSize: 10, search: "nessuna-corrispondenza" });

        expect(result).toEqual({ items: [], totalItems: 0 });
    });
});

describe("listTechnicians: ordinamento e paginazione", () => {
    it("ordina sempre per nome e cognome", async () => {
        const bianchi = await insertTechnician({ firstName: "Anna", lastName: "Bianchi" });
        const rossi = await insertTechnician({ firstName: "Anna", lastName: "Rossi" });
        const senzaCognome = await insertTechnician({ firstName: "Bruno" });

        const result = await listTechnicians({ page: 1, pageSize: 10 });

        expect(Array.isArray(result) ? [] : result.items.map((item) => item.id)).toEqual([
            bianchi.id,
            rossi.id,
            senzaCognome.id,
        ]);
    });

    it("pagina i risultati e conta tutte le righe", async () => {
        const technicians = [
            await insertTechnician({ firstName: "A" }),
            await insertTechnician({ firstName: "B" }),
            await insertTechnician({ firstName: "C" }),
            await insertTechnician({ firstName: "D" }),
            await insertTechnician({ firstName: "E" }),
        ];

        const secondPage = await listTechnicians({ page: 2, pageSize: 2 });
        const beyond = await listTechnicians({ page: 4, pageSize: 2 });

        expect(secondPage).toMatchObject({
            totalItems: 5,
            items: [{ id: technicians[2].id }, { id: technicians[3].id }],
        });
        expect(beyond).toEqual({ items: [], totalItems: 5 });
    });

    it("senza paginazione restituisce l'elenco intero", async () => {
        await insertTechnician();
        await insertTechnician();

        const result = await listTechnicians({});

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
    });
});
