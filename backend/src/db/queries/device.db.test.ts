import { describe, expect, it } from "vitest";
import { insertDevice } from "../../test/db/fixtures";
import { createDevice, listDevices } from "./device";

describe("createDevice: unicità del nome", () => {
    it("rifiuta un nome duplicato solo per maiuscole/minuscole", async () => {
        await insertDevice("iPhone 13");

        await expect(createDevice({ name: "iphone 13" })).rejects.toMatchObject({ cause: { code: "23505" } });
    });

    it("accetta nomi distinti", async () => {
        await insertDevice("iPhone 13");

        await expect(createDevice({ name: "iPhone 14" })).resolves.toEqual([
            expect.objectContaining({ name: "iPhone 14" }),
        ]);
    });
});

describe("listDevices: ricerca, ordinamento e paginazione", () => {
    const findIds = async (params: Omit<Parameters<typeof listDevices>[0], "page" | "pageSize">) => {
        const result = await listDevices({ page: 1, pageSize: 100, ...params });

        if (Array.isArray(result)) {
            throw new Error("attesa una lista paginata");
        }

        return result.items.map((item) => item.id).sort((a, b) => a - b);
    };

    it("trova per nome, senza distinguere maiuscole e minuscole", async () => {
        const target = await insertDevice("iPhone Zefiro 13");
        await insertDevice();

        expect(await findIds({ search: "zefiro" })).toEqual([target.id]);
        expect(await findIds({ search: "ZEFIRO" })).toEqual([target.id]);
    });

    it("un numero trova il dispositivo con quell'id, non quelli che lo contengono", async () => {
        const devices = [];
        for (let index = 0; index < 12; index += 1) {
            devices.push(await insertDevice());
        }

        expect(await findIds({ search: "1" })).toEqual([devices[0].id]);
    });

    it("ordina sempre per nome", async () => {
        const beta = await insertDevice("Beta");
        const alfa = await insertDevice("Alfa");

        const result = await listDevices({ page: 1, pageSize: 10 });

        expect(Array.isArray(result) ? [] : result.items.map((item) => item.id)).toEqual([alfa.id, beta.id]);
    });

    it("pagina i risultati e conta tutte le righe", async () => {
        const devices = [
            await insertDevice("A"),
            await insertDevice("B"),
            await insertDevice("C"),
            await insertDevice("D"),
            await insertDevice("E"),
        ];

        const secondPage = await listDevices({ page: 2, pageSize: 2 });
        const beyond = await listDevices({ page: 4, pageSize: 2 });

        expect(secondPage).toMatchObject({ totalItems: 5, items: [{ id: devices[2].id }, { id: devices[3].id }] });
        expect(beyond).toEqual({ items: [], totalItems: 5 });
    });

    it("senza paginazione restituisce l'elenco intero", async () => {
        await insertDevice();
        await insertDevice();

        const result = await listDevices({});

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
    });
});
