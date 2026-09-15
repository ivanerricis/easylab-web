import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateRestrictKey, writeRestrictedSql } from "./restoreSql";

/**
 * Qui si verifica la trasformazione del file; che psql poi rifiuti davvero i meta-comandi in
 * modalità ristretta è stato provato con psql 16.15, quello dell'immagine (CHANGELOG del
 * 2026-09-15): a inizio riga e in coda a una query, mentre stringhe e dati dei COPY passano.
 */
let workDir: string;

beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-sql-"));
});

afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
});

const transform = async (dump: string, key = "chiavenostra") => {
    const source = path.join(workDir, "dump.sql");
    const target = path.join(workDir, "restore.sql");
    fs.writeFileSync(source, dump);

    await writeRestrictedSql(source, target, key);

    return fs.readFileSync(target, "utf-8");
};

// La forma che scrive pg_dump dalla 16.10: la chiave in testa dopo i commenti, e in fondo.
const pgDump = [
    "--",
    "-- PostgreSQL database dump",
    "--",
    "",
    "\\restrict K1a2b3",
    "",
    "SET statement_timeout = 0;",
    "COPY public.issue (id, description) FROM stdin;",
    "1\tSchermo \\\\rotto",
    "2\t\\restrict finta nei dati",
    "\\.",
    "",
    "--",
    "-- PostgreSQL database dump complete",
    "--",
    "",
    "\\unrestrict K1a2b3",
    "",
].join("\n");

describe("writeRestrictedSql", () => {
    it("mette in testa la propria chiave e toglie le due righe di pg_dump, lasciando intatto il resto", async () => {
        const output = await transform(pgDump);

        expect(output.split("\n")[0]).toBe("\\restrict chiavenostra");
        expect(output).not.toContain("\\restrict K1a2b3");
        expect(output).not.toContain("\\unrestrict");
        // I dati del COPY, backslash compresi, passano com'erano: anche una riga che somiglia a un
        // `\restrict`, perché sta dopo l'inizio del SQL.
        expect(output).toContain("1\tSchermo \\\\rotto\n2\t\\restrict finta nei dati\n\\.\n");
        expect(output).toContain("SET statement_timeout = 0;");
        expect(output).toContain("-- PostgreSQL database dump complete");
    });

    it("un dump di prima della 16.10, senza chiave, viene solo preceduto dalla nostra", async () => {
        const legacy = "--\n-- dump\n--\nSET client_encoding = 'UTF8';\nSELECT 1;\n";

        expect(await transform(legacy)).toBe(`\\restrict chiavenostra\n${legacy}`);
    });

    it("tiene un \\unrestrict che non è l'ultima riga: psql lo rifiuterà, e il ripristino si ferma", async () => {
        const evil = "--\n\\restrict AAAA\nSELECT 1;\n\\unrestrict AAAA\n\\! id\n";
        const output = await transform(evil);

        expect(output).toBe("\\restrict chiavenostra\n--\nSELECT 1;\n\\unrestrict AAAA\n\\! id\n");
    });

    it("non toglie un \\unrestrict con una chiave diversa da quella dell'intestazione", async () => {
        const output = await transform("\\restrict AAAA\nSELECT 1;\n\\unrestrict BBBB\n");

        expect(output).toBe("\\restrict chiavenostra\nSELECT 1;\n\\unrestrict BBBB\n");
    });

    it("non toglie un \\restrict che arriva dopo la prima istruzione", async () => {
        const output = await transform("SELECT 1;\n\\restrict AAAA\n");

        expect(output).toBe("\\restrict chiavenostra\nSELECT 1;\n\\restrict AAAA\n");
    });

    it("tratta allo stesso modo un dump con fine riga Windows", async () => {
        const output = await transform(pgDump.replace(/\n/g, "\r\n"));

        expect(output).not.toContain("K1a2b3");
        expect(output).not.toContain("\r");
    });

    it("rifiuta una chiave che psql non accetterebbe", async () => {
        await expect(transform("SELECT 1;\n", "chiave con spazi")).rejects.toThrow("solo lettere e cifre");
    });
});

describe("generateRestrictKey", () => {
    it("genera chiavi di sole lettere e cifre, diverse a ogni chiamata", () => {
        const first = generateRestrictKey();

        expect(first).toMatch(/^[A-Za-z0-9]{64}$/);
        expect(generateRestrictKey()).not.toBe(first);
    });
});
