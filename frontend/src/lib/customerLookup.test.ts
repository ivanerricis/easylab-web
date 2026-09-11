import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerDto } from "@/types/dtos";

const listCustomers = vi.fn();

vi.mock("@/lib/api", () => ({
    listCustomers: (params: unknown) => listCustomers(params) as Promise<unknown>,
}));

import { customerSearchTerms, findCustomerByText, resolveCustomerId } from "./customerLookup";

const customer = (id: number, firstName: string, lastName: string | null, phoneNumber: string | null) =>
    ({
        id,
        firstName,
        lastName,
        phoneNumber,
        phoneNumberSecondary: null,
        email: null,
        city: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: null,
    }) satisfies CustomerDto;

const page = (items: CustomerDto[], totalItems = items.length) => ({ items, totalItems, totalPages: 1, page: 1 });

describe("customerSearchTerms", () => {
    it("cerca prima il telefono, poi la parola più lunga del nome", () => {
        expect(customerSearchTerms("Mario Rossi - 333 1234567")).toEqual(["333 1234567", "Rossi"]);
    });

    it("non cerca il segnaposto di chi non ha telefono", () => {
        expect(customerSearchTerms("Anna Esposito - N/D")).toEqual(["Esposito"]);
    });

    it("con il solo nome cerca il nome", () => {
        expect(customerSearchTerms("  Federica   Moretti ")).toEqual(["Federica"]);
    });

    it("non ripete lo stesso termine", () => {
        expect(customerSearchTerms("Rossi")).toEqual(["Rossi"]);
    });
});

describe("findCustomerByText", () => {
    beforeEach(() => {
        listCustomers.mockReset();
    });

    /**
     * Il motivo della funzione: il cliente va cercato sul server. Prima si scaricava l'elenco
     * intero, che senza paginazione si ferma a 5000 righe, e un cliente oltre quelle
     * risultava inesistente.
     */
    it("chiede al server solo i candidati, con una pagina esplicita", async () => {
        listCustomers.mockResolvedValue(page([customer(9001, "Mario", "Rossi", "333 1234567")]));

        const found = await findCustomerByText("Mario Rossi - 333 1234567");

        expect(found?.id).toBe(9001);
        expect(listCustomers).toHaveBeenCalledTimes(1);
        expect(listCustomers.mock.calls[0][0]).toMatchObject({ page: 1, search: "333 1234567" });
    });

    it("se il telefono non porta a nessuno, riprova col nome", async () => {
        listCustomers
            .mockResolvedValueOnce(page([]))
            .mockResolvedValueOnce(page([customer(7, "Mario", "Rossi", "333 7654321")]));

        const found = await findCustomerByText("Mario Rossi - 333 0000000");

        expect(found?.id).toBe(7);
        expect(listCustomers.mock.calls[1][0]).toMatchObject({ search: "Rossi" });
    });

    it("con due omonimi senza telefono non sceglie a caso", async () => {
        listCustomers.mockResolvedValue(
            page([customer(1, "Mario", "Rossi", "333 1111111"), customer(2, "Mario", "Rossi", "333 2222222")])
        );

        await expect(findCustomerByText("Mario Rossi")).rejects.toThrow(/stesso nome/i);
    });

    /**
     * Se il server ha più candidati di quelli restituiti, fra quelli esclusi potrebbe esserci
     * un omonimo: meglio chiedere di sceglierlo dai suggerimenti che intestare il report alla
     * persona sbagliata.
     */
    it("se i candidati sono troppi, lo dice invece di scegliere", async () => {
        listCustomers.mockResolvedValue(page([customer(1, "Mario", "Rossi", null)], 4000));

        await expect(findCustomerByText("Mario Rossi")).rejects.toThrow(/sceglilo dai suggerimenti/i);
    });

    it("torna null se il cliente non esiste", async () => {
        listCustomers.mockResolvedValue(page([]));

        expect(await findCustomerByText("Nessuno Qui - 000")).toBeNull();
    });
});

describe("resolveCustomerId", () => {
    beforeEach(() => {
        listCustomers.mockReset();
    });

    it("usa l'id già risolto dal dialogo senza chiamare il server", async () => {
        expect(await resolveCustomerId(42, "Mario Rossi - 333 1234567")).toBe(42);
        expect(listCustomers).not.toHaveBeenCalled();
    });

    it("rifiuta un cliente che non esiste", async () => {
        listCustomers.mockResolvedValue(page([]));

        await expect(resolveCustomerId(null, "Cliente inventato")).rejects.toThrow(/cliente esistente/i);
    });
});
