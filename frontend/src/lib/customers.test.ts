import { describe, expect, it } from "vitest";
import { formatCustomerOption, resolveSelectedCustomer } from "./customers";
import type { CustomerDto } from "@/types/dtos";

const buildCustomer = (overrides: Partial<CustomerDto> & Pick<CustomerDto, "id" | "firstName">): CustomerDto => ({
    lastName: null,
    phoneNumber: null,
    phoneNumberSecondary: null,
    email: null,
    city: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
    ...overrides,
});

describe("formatCustomerOption", () => {
    it("scrive nome, cognome e telefono principale", () => {
        expect(formatCustomerOption("Mario", "Rossi", "333 1234567", "06 123456")).toBe("Mario Rossi - 333 1234567");
    });

    it("ricade sul telefono secondario e poi su N/D", () => {
        expect(formatCustomerOption("Mario", "Rossi", null, "06 123456")).toBe("Mario Rossi - 06 123456");
        expect(formatCustomerOption("Mario", "Rossi", "  ", "  ")).toBe("Mario Rossi - N/D");
        expect(formatCustomerOption("Mario", "Rossi", null, null)).toBe("Mario Rossi - N/D");
    });

    it("non lascia spazi in coda quando manca il cognome", () => {
        expect(formatCustomerOption("Mario", null, "333", null)).toBe("Mario - 333");
    });
});

describe("resolveSelectedCustomer", () => {
    const mario = buildCustomer({ id: 1, firstName: "Mario", lastName: "Rossi", phoneNumber: "333" });
    const anna = buildCustomer({ id: 2, firstName: "Anna", lastName: "D'Angelo", phoneNumber: "347" });

    it("trova il cliente dalla stringa esatta dell'opzione", () => {
        expect(resolveSelectedCustomer([mario, anna], "Mario Rossi - 333")).toBe(mario);
    });

    /**
     * È il motivo della normalizzazione: chi digita non rispetta maiuscole, accenti e spazi
     * doppi, ma sta indicando lo stesso cliente.
     */
    it("ignora maiuscole, accenti e spazi doppi", () => {
        const nicola = buildCustomer({ id: 3, firstName: "Nicolò", lastName: "Esposito", phoneNumber: "320" });

        expect(resolveSelectedCustomer([mario, anna, nicola], "  ANNA   d'angelo - 347 ")).toBe(anna);
        expect(resolveSelectedCustomer([mario, anna, nicola], "nicolo esposito - 320")).toBe(nicola);
    });

    it("accetta il solo nome quando identifica un cliente solo", () => {
        expect(resolveSelectedCustomer([mario, anna], "Mario Rossi")).toBe(mario);
    });

    it("restituisce null quando nessun cliente corrisponde", () => {
        expect(resolveSelectedCustomer([mario, anna], "Luigi Verdi")).toBeNull();
        expect(resolveSelectedCustomer([], "Mario Rossi")).toBeNull();
    });

    it("rifiuta un nome condiviso da più clienti senza telefono", () => {
        const otherMario = buildCustomer({ id: 4, firstName: "Mario", lastName: "Rossi", phoneNumber: "339" });

        expect(() => resolveSelectedCustomer([mario, otherMario], "Mario Rossi")).toThrow(
            "Esistono più clienti con lo stesso nome"
        );
        // Con il telefono l'omonimia si risolve.
        expect(resolveSelectedCustomer([mario, otherMario], "Mario Rossi - 339")).toBe(otherMario);
    });

    it("rifiuta una stringa completa che corrisponde a più clienti", () => {
        const twin = buildCustomer({ id: 5, firstName: "Mario", lastName: "Rossi", phoneNumber: "333" });

        expect(() => resolveSelectedCustomer([mario, twin], "Mario Rossi - 333")).toThrow(
            "Il cliente selezionato non è univoco"
        );
    });
});
