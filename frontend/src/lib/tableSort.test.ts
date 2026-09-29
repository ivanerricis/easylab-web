import { describe, expect, it } from "vitest";
import { formatSortOption, parseSortOption, parseSortParams } from "./tableSort";

describe("parseSortOption", () => {
    it("separa il campo dal verso", () => {
        expect(parseSortOption("name:asc")).toEqual({ key: "name", direction: "asc" });
        expect(parseSortOption("createdAt:desc")).toEqual({ key: "createdAt", direction: "desc" });
    });

    /** Un indirizzo scritto a mano o vecchio non deve lasciare la lista senza verso. */
    it("con un verso mancante o sconosciuto ripiega su quello discendente", () => {
        expect(parseSortOption("name")).toEqual({ key: "name", direction: "desc" });
        expect(parseSortOption("name:")).toEqual({ key: "name", direction: "desc" });
        expect(parseSortOption("name:ASC")).toEqual({ key: "name", direction: "desc" });
        expect(parseSortOption("name:boh")).toEqual({ key: "name", direction: "desc" });
    });
});

describe("formatSortOption", () => {
    it('scrive la forma "campo:verso" dei menu e dell\'indirizzo', () => {
        expect(formatSortOption({ key: "name", direction: "asc" })).toBe("name:asc");
        expect(formatSortOption({ key: "createdAt", direction: "desc" })).toBe("createdAt:desc");
    });

    it("è l'inversa di parseSortOption per i valori validi", () => {
        for (const value of ["name:asc", "name:desc", "reportDate:asc", "customerName:desc"]) {
            expect(formatSortOption(parseSortOption(value))).toBe(value);
        }
    });
});

type Field = "createdAt" | "name";
const fields: Record<Field, true> = { createdAt: true, name: true };

describe("parseSortParams", () => {
    it("spezza un'opzione valida in campo e verso", () => {
        expect(parseSortParams<Field>("name:asc", fields, "createdAt:desc")).toEqual({
            sortBy: "name",
            sortOrder: "asc",
        });
        expect(parseSortParams<Field>("createdAt:desc", fields, "name:asc")).toEqual({
            sortBy: "createdAt",
            sortOrder: "desc",
        });
    });

    it.each([
        ["campo sconosciuto", "total:asc"],
        ["verso sconosciuto", "name:up"],
        ["senza verso", "name"],
        ["stringa vuota", ""],
        ["parti in più", "name:asc:extra"],
        // Una chiave ereditata da Object.prototype non è un campo ammesso.
        ["chiave del prototipo", "toString:asc"],
    ])("con %s ricade sull'ordinamento predefinito", (_label, value) => {
        expect(parseSortParams<Field>(value, fields, "createdAt:desc")).toEqual({
            sortBy: "createdAt",
            sortOrder: "desc",
        });
    });
});
