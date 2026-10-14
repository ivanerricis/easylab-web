import { describe, expect, it } from "vitest";
import { insertCustomer } from "../../test/db/fixtures";
import { listCustomers } from "./customer";

/** Gli id trovati, in ordine: il confronto che interessa quasi sempre. */
const findIds = async (params: Omit<Parameters<typeof listCustomers>[0], "page" | "pageSize">) => {
    const result = await listCustomers({ page: 1, pageSize: 100, ...params });

    if (Array.isArray(result)) {
        throw new Error("attesa una lista paginata");
    }

    return result.items.map((item) => item.id).sort((a, b) => a - b);
};

const search = (text: string) => findIds({ search: text });

describe("listCustomers: ricerca libera", () => {
    it.each([
        ["il nome", { firstName: "Zefirino" }],
        ["il cognome", { firstName: "Mario", lastName: "Zefirelli" }],
        ["il telefono", { firstName: "Mario", phoneNumber: "333 999 0001" }],
        ["il secondo telefono", { firstName: "Mario", phoneNumberSecondary: "333 999 0001" }],
        ["l'email", { firstName: "Mario", email: "zefiro@example.com" }],
        ["la città", { firstName: "Mario", city: "Zefiropoli" }],
    ])("trova per %s", async (label, values) => {
        const target = await insertCustomer(values);
        await insertCustomer();

        const text = label.includes("telefono") ? "999 0001" : "zefir";
        expect(await search(text)).toEqual([target.id]);
    });

    it("non distingue maiuscole e minuscole", async () => {
        const target = await insertCustomer({ firstName: "ZEFIRO" });

        expect(await search("zefiro")).toEqual([target.id]);
    });

    describe("non distingue gli accenti (nome, cognome, città)", () => {
        it.each([
            ["il nome", { firstName: "Nicolò" }, "Nicolo"],
            ["il cognome", { firstName: "Mario", lastName: "Perù" }, "Peru"],
            ["la città", { firstName: "Mario", city: "Forlì" }, "Forli"],
        ])("trova per %s scritto senza accento", async (label, values, searchText) => {
            const target = await insertCustomer(values);
            const decoy = await insertCustomer();

            expect(await search(searchText)).toEqual([target.id]);
            expect(await search(searchText)).not.toContain(decoy.id);
        });

        it("il nome accentato si trova ancora scrivendolo con l'accento", async () => {
            const target = await insertCustomer({ firstName: "Nicolò" });

            expect(await search("Nicolò")).toEqual([target.id]);
        });

        it("togliere l'accento non fa comparire nomi non correlati", async () => {
            const target = await insertCustomer({ firstName: "Nicolò" });
            const unrelated = await insertCustomer({ firstName: "Marco", lastName: "Verdi" });

            expect(await search("Nicolo")).toEqual([target.id]);
            expect(await search("Nicolo")).not.toContain(unrelated.id);
        });
    });

    describe("più parole (nome e cognome insieme)", () => {
        it("trova per nome e cognome, in qualsiasi ordine", async () => {
            const target = await insertCustomer({ firstName: "Anna", lastName: "Romano" });
            await insertCustomer({ firstName: "Anna", lastName: "Bianchi" });
            await insertCustomer({ firstName: "Luca", lastName: "Romano" });

            expect(await search("Anna Romano")).toEqual([target.id]);
            expect(await search("Romano Anna")).toEqual([target.id]);
            expect(await search("  anna   ROMANO ")).toEqual([target.id]);
        });

        it("ignora gli accenti su entrambe le parole", async () => {
            const target = await insertCustomer({ firstName: "Nicolò", lastName: "Verdì" });

            expect(await search("Nicolo Verdi")).toEqual([target.id]);
        });

        it("accetta parole parziali", async () => {
            const target = await insertCustomer({ firstName: "Anna", lastName: "Romano" });
            await insertCustomer({ firstName: "Luca", lastName: "Verdi" });

            expect(await search("Ann Rom")).toEqual([target.id]);
        });

        it("serve che ogni parola corrisponda: una sola non basta", async () => {
            await insertCustomer({ firstName: "Anna", lastName: "Romano" });

            expect(await search("Anna Zzzz")).toEqual([]);
            expect(await search("Zzzz Romano")).toEqual([]);
        });

        it("una frase senza corrispondenze non trova niente", async () => {
            await insertCustomer({ firstName: "Anna", lastName: "Romano" });

            const result = await listCustomers({ page: 1, pageSize: 10, search: "Qqqq Zzzz" });

            expect(result).toEqual({ items: [], totalItems: 0 });
        });

        it("un telefono scritto con lo spazio si trova ancora", async () => {
            const target = await insertCustomer({ firstName: "Mario", phoneNumber: "+39 3000628318" });
            await insertCustomer();

            expect(await search("+39 3000628318")).toEqual([target.id]);
        });

        it("una città di due parole si trova ancora", async () => {
            const target = await insertCustomer({ firstName: "Mario", city: "La Spezia" });
            await insertCustomer();

            expect(await search("La Spezia")).toEqual([target.id]);
        });

        it("con una parola sola la ricerca resta quella di prima, id compreso", async () => {
            const target = await insertCustomer({ firstName: "Anna", lastName: "Romano" });
            await insertCustomer({ firstName: "Luca", lastName: "Verdi" });

            expect(await search("Romano")).toEqual([target.id]);
            expect(await search(String(target.id))).toEqual([target.id]);
        });
    });

    it("un numero trova il cliente con quell'id, non quelli che lo contengono", async () => {
        const customers = [];
        for (let index = 0; index < 12; index += 1) {
            customers.push(await insertCustomer());
        }

        expect(await search("1")).toEqual([customers[0].id]);
    });

    it("una ricerca senza corrispondenze non trova niente e conta zero", async () => {
        await insertCustomer({ firstName: "Qualcosa" });

        const result = await listCustomers({ page: 1, pageSize: 10, search: "nessuna-corrispondenza" });

        expect(result).toEqual({ items: [], totalItems: 0 });
    });

    it("il totale con la ricerca conta tutte le corrispondenze, non solo la pagina", async () => {
        for (let index = 0; index < 5; index += 1) {
            await insertCustomer({ firstName: "Zefiro" });
        }
        await insertCustomer();

        const result = await listCustomers({ page: 2, pageSize: 2, search: "zefiro" });

        expect(result).toMatchObject({ totalItems: 5 });
        expect(Array.isArray(result) ? [] : result.items).toHaveLength(2);
    });
});

describe("listCustomers: ordinamento e paginazione", () => {
    it("ordina per data di creazione, dal più recente se non si chiede altro", async () => {
        const middle = await insertCustomer({ created_at: new Date("2026-02-01T10:00:00Z") });
        const oldest = await insertCustomer({ created_at: new Date("2026-01-01T10:00:00Z") });
        const newest = await insertCustomer({ created_at: new Date("2026-03-01T10:00:00Z") });

        const result = await listCustomers({ page: 1, pageSize: 10 });
        const ascending = await listCustomers({ page: 1, pageSize: 10, sortOrder: "asc" });

        expect(Array.isArray(result) ? [] : result.items.map((item) => item.id)).toEqual([
            newest.id,
            middle.id,
            oldest.id,
        ]);
        expect(Array.isArray(ascending) ? [] : ascending.items.map((item) => item.id)).toEqual([
            oldest.id,
            middle.id,
            newest.id,
        ]);
    });

    it("ordina per nome e cognome", async () => {
        const bianchi = await insertCustomer({ firstName: "Anna", lastName: "Bianchi" });
        const rossi = await insertCustomer({ firstName: "Anna", lastName: "Rossi" });
        const senzaCognome = await insertCustomer({ firstName: "Bruno" });

        const result = await listCustomers({ page: 1, pageSize: 10, sortBy: "name", sortOrder: "asc" });

        expect(Array.isArray(result) ? [] : result.items.map((item) => item.id)).toEqual([
            bianchi.id,
            rossi.id,
            senzaCognome.id,
        ]);
    });

    it("pagina i risultati e conta tutte le righe", async () => {
        const customers = [];
        for (let day = 1; day <= 5; day += 1) {
            customers.push(await insertCustomer({ created_at: new Date(`2026-04-0${day}T10:00:00Z`) }));
        }

        const secondPage = await listCustomers({ page: 2, pageSize: 2 });
        const beyond = await listCustomers({ page: 4, pageSize: 2 });

        // Dal più recente: 5 4 | 3 2 | 1
        expect(secondPage).toMatchObject({ totalItems: 5, items: [{ id: customers[2].id }, { id: customers[1].id }] });
        expect(beyond).toEqual({ items: [], totalItems: 5 });
    });

    it("senza paginazione restituisce l'elenco intero", async () => {
        await insertCustomer();
        await insertCustomer();

        const result = await listCustomers({});

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
    });
});
