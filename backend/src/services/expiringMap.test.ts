import { describe, expect, it } from "vitest";
import { pruneExpiring } from "./expiringMap";

type Entry = { expiresAt: number };

const prune = (entries: Map<string, Entry>, maxEntries: number, now: number) =>
    pruneExpiring(entries, maxEntries, now, (entry) => entry.expiresAt);

describe("pruneExpiring", () => {
    it("scarta solo le voci già scadute, sotto il tetto", () => {
        const entries = new Map<string, Entry>([
            ["scaduta", { expiresAt: 100 }],
            ["viva", { expiresAt: 200 }],
        ]);

        prune(entries, 10, 150);

        expect([...entries.keys()]).toEqual(["viva"]);
    });

    it("non tocca nulla quando è sotto il tetto e niente è scaduto", () => {
        const entries = new Map<string, Entry>([
            ["a", { expiresAt: 200 }],
            ["b", { expiresAt: 300 }],
        ]);

        prune(entries, 10, 100);

        expect(entries.size).toBe(2);
    });

    it("oltre il tetto scarta anche voci non scadute, le più vicine alla scadenza per prime", () => {
        const entries = new Map<string, Entry>([
            ["primaAScadere", { expiresAt: 200 }],
            ["mezzo", { expiresAt: 300 }],
            ["ultimaAScadere", { expiresAt: 400 }],
        ]);

        // Tetto 2 su 3 voci: l'eccedenza è size - max + 1 = 2, quindi ne restano scartate
        // due, non solo l'eccesso vero e proprio — resta un margine sotto il tetto.
        prune(entries, 2, 100);

        expect([...entries.keys()]).toEqual(["ultimaAScadere"]);
    });

    it("scade prima le voci vecchie, poi applica il tetto solo su quelle rimaste", () => {
        const entries = new Map<string, Entry>([
            ["scaduta1", { expiresAt: 100 }],
            ["scaduta2", { expiresAt: 100 }],
            ["viva1", { expiresAt: 500 }],
            ["viva2", { expiresAt: 600 }],
        ]);

        prune(entries, 3, 150);

        // Le due scadute se ne vanno per la scadenza; il tetto (3) non scatta più, restano
        // entrambe le vive.
        expect([...entries.keys()]).toEqual(["viva1", "viva2"]);
    });
});
