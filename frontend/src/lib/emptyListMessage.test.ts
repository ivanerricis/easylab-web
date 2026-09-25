import { describe, expect, it } from "vitest";
import { resolveEmptyListMessage } from "./emptyListMessage";

describe("resolveEmptyListMessage", () => {
    const emptyMessage = "Nessun report disponibile.";
    const filteredMessage = "Nessun report corrisponde ai filtri.";

    it("senza ricerca né filtri è la lista davvero vuota", () => {
        expect(resolveEmptyListMessage({ emptyMessage, searchText: "  ", filteredMessage })).toBe(emptyMessage);
    });

    it("con una ricerca nomina il testo cercato, senza gli spazi ai lati", () => {
        expect(resolveEmptyListMessage({ emptyMessage, searchText: " mrio ", filteredMessage })).toBe(
            'Nessun risultato per "mrio".'
        );
    });

    it("con un filtro attivo dice che è il filtro a non trovare niente", () => {
        expect(resolveEmptyListMessage({ emptyMessage, hasActiveFilters: true, filteredMessage })).toBe(
            filteredMessage
        );
    });

    it("con ricerca e filtri insieme li nomina entrambi", () => {
        expect(
            resolveEmptyListMessage({ emptyMessage, searchText: "mrio", hasActiveFilters: true, filteredMessage })
        ).toBe('Nessun risultato per "mrio" con i filtri attivi.');
    });
});
