import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

type Row = { id: number; name: string | null; active: boolean; note: string | null; createdAt: Date };

const columns = [
    { header: "ID", value: (row: Row) => row.id },
    { header: "Nome", value: (row: Row) => row.name },
    { header: "Attivo", value: (row: Row) => row.active },
    { header: "Note", value: (row: Row) => row.note },
    { header: "Creato il", value: (row: Row) => row.createdAt },
];

describe("toCsv", () => {
    it("scrive intestazione e righe separate da virgola, terminate da CRLF", () => {
        const csv = toCsv<Row>(
            [{ id: 1, name: "Mario", active: true, note: null, createdAt: new Date("2026-01-01T10:00:00.000Z") }],
            columns
        );

        expect(csv).toBe("﻿ID,Nome,Attivo,Note,Creato il\r\n1,Mario,Sì,,2026-01-01T10:00:00.000Z\r\n");
    });

    it("mette tra virgolette i campi con virgola, virgolette o a-capo, raddoppiando le virgolette interne", () => {
        const csv = toCsv<Row>(
            [
                {
                    id: 2,
                    name: 'Rossi, "il Mario"\nsecondo',
                    active: false,
                    note: null,
                    createdAt: new Date("2026-01-02T00:00:00.000Z"),
                },
            ],
            columns
        );

        expect(csv).toContain('"Rossi, ""il Mario""\nsecondo"');
        expect(csv).toContain(",No,");
    });

    it("un valore null o undefined diventa una cella vuota", () => {
        const csv = toCsv<Row>(
            [{ id: 3, name: null, active: true, note: null, createdAt: new Date("2026-01-03T00:00:00.000Z") }],
            columns
        );

        expect(csv.split("\r\n")[1]).toBe("3,,Sì,,2026-01-03T00:00:00.000Z");
    });

    it("senza righe scrive solo l'intestazione", () => {
        expect(toCsv<Row>([], columns)).toBe("﻿ID,Nome,Attivo,Note,Creato il\r\n");
    });
});
