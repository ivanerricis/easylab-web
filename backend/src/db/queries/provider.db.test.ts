import { describe, expect, it } from "vitest";
import { insertProvider } from "../../test/db/fixtures";
import { listProviders } from "./provider";

type ListParams = Parameters<typeof listProviders>[0];

const findIds = async (params: Omit<ListParams, "page" | "pageSize">) => {
    const result = await listProviders({ page: 1, pageSize: 100, ...params });

    if (Array.isArray(result)) {
        throw new Error("attesa una lista paginata");
    }

    return result.items.map((item) => item.id);
};

describe("listProviders: ricerca libera", () => {
    it.each([
        ["il nome del fornitore", { providerName: "Zefirnet Srl" }, "zefirnet"],
        ["il nome della persona", { firstName: "Zefiro" }, "zefiro"],
        ["il cognome della persona", { lastName: "Zefirelli" }, "zefirelli"],
        ["l'email", { email: "zefiro@example.test" }, "zefiro@"],
        ["il telefono", { phoneNumber: "999 0001" }, "999 0001"],
    ])("trova per %s", async (_label, values, text) => {
        const target = await insertProvider(values);
        await insertProvider();

        expect(await findIds({ search: text })).toEqual([target.id]);
    });

    it("non distingue maiuscole e minuscole", async () => {
        const target = await insertProvider({ providerName: "ZEFIRNET" });

        expect(await findIds({ search: "zefirnet" })).toEqual([target.id]);
    });

    it("un numero trova il fornitore con quell'id, non quelli che lo contengono", async () => {
        const providers = [];
        for (let index = 0; index < 12; index += 1) {
            providers.push(await insertProvider());
        }

        expect(await findIds({ search: "1" })).toEqual([providers[0].id]);
    });

    it("una ricerca senza corrispondenze non trova niente e conta zero", async () => {
        await insertProvider();

        expect(await listProviders({ page: 1, pageSize: 10, search: "nessuna-corrispondenza" })).toEqual({
            items: [],
            totalItems: 0,
        });
    });
});

describe("listProviders: ordinamento e paginazione", () => {
    it("per nome in ordine alfabetico, ascendente per predefinito", async () => {
        const beta = await insertProvider({ providerName: "Beta" });
        const alfa = await insertProvider({ providerName: "alfa" });
        const gamma = await insertProvider({ providerName: "Gamma" });

        expect(await findIds({})).toEqual([alfa.id, beta.id, gamma.id]);
        expect(await findIds({ sortBy: "providerName", sortOrder: "desc" })).toEqual([gamma.id, beta.id, alfa.id]);
    });

    it("per data di creazione", async () => {
        const first = await insertProvider({ providerName: "Zeta" });
        const second = await insertProvider({ providerName: "Alfa" });

        expect(await findIds({ sortBy: "createdAt", sortOrder: "asc" })).toEqual([first.id, second.id]);
        expect(await findIds({ sortBy: "createdAt", sortOrder: "desc" })).toEqual([second.id, first.id]);
    });

    it("il totale conta tutte le righe, la pagina solo quelle richieste", async () => {
        for (let index = 0; index < 3; index += 1) {
            await insertProvider();
        }

        const result = await listProviders({ page: 2, pageSize: 2 });

        expect(result).toMatchObject({ totalItems: 3 });
        expect(Array.isArray(result) ? [] : result.items).toHaveLength(1);
    });
});
