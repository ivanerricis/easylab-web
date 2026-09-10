import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdir = vi.fn();
const appendFile = vi.fn();
const readdir = vi.fn();
const unlink = vi.fn();
const stat = vi.fn();
const readFile = vi.fn();

vi.mock("node:fs", () => {
    const promises = {
        mkdir: (...args: unknown[]) => mkdir(...args),
        appendFile: (...args: unknown[]) => appendFile(...args),
        readdir: (...args: unknown[]) => readdir(...args),
        unlink: (...args: unknown[]) => unlink(...args),
        stat: (...args: unknown[]) => stat(...args),
        readFile: (...args: unknown[]) => readFile(...args),
    };
    return { default: { promises }, promises };
});

import { LogManagerError, appendUserActionLog, getDayKey, getLogFilePath, listLogFiles, readLogEntries } from "./logManager";

const direntFile = (name: string) => ({ name, isFile: () => true, isDirectory: () => false });

beforeEach(() => {
    vi.clearAllMocks();
    mkdir.mockResolvedValue(undefined);
    appendFile.mockResolvedValue(undefined);
    unlink.mockResolvedValue(undefined);
});

describe("getDayKey", () => {
    it("estrae AAAA-MM-GG in UTC dalla data", () => {
        expect(getDayKey(new Date("2026-03-05T23:30:00.000Z"))).toBe("2026-03-05");
    });
});

describe("getLogFilePath", () => {
    it("accetta una dayKey nel formato atteso", () => {
        expect(getLogFilePath("2026-03-05")).toMatch(/user-actions-2026-03-05\.log$/);
    });

    it("rifiuta una dayKey malformata", () => {
        for (const dayKey of ["2026-3-5", "20260305", "non-una-data", "2026-03-05T00:00"]) {
            expect(() => getLogFilePath(dayKey)).toThrow(LogManagerError);
        }
    });
});

describe("readLogEntries", () => {
    it("propaga il 400 di una dayKey non valida", async () => {
        await expect(readLogEntries("data-sbagliata")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("nessun file per quella data: 404", async () => {
        readFile.mockRejectedValue(new Error("ENOENT"));

        await expect(readLogEntries("2026-03-05")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("interpreta le righe, comprese quelle scritte prima che esistesse il campo utente", async () => {
        const righe = [
            "2026-03-05T10:00:00.000Z | ip=1.2.3.4 | user=mario | action=login | status=200",
            "2026-03-05T10:01:00.000Z | ip=5.6.7.8 | action=login | status=200",
            "2026-03-05T10:02:00.000Z | ip=1.2.3.4 | user=mario | action=delete-customer | status=500 | error=boom",
            "",
        ].join("\n");
        readFile.mockResolvedValue(righe);

        const entries = await readLogEntries("2026-03-05");

        // Ordine invertito: la più recente prima.
        expect(entries).toEqual([
            {
                timestamp: "2026-03-05T10:02:00.000Z",
                ip: "1.2.3.4",
                user: "mario",
                action: "delete-customer",
                status: 500,
                error: "boom",
            },
            {
                timestamp: "2026-03-05T10:01:00.000Z",
                ip: "5.6.7.8",
                user: "-",
                action: "login",
                status: 200,
                error: null,
            },
            {
                timestamp: "2026-03-05T10:00:00.000Z",
                ip: "1.2.3.4",
                user: "mario",
                action: "login",
                status: 200,
                error: null,
            },
        ]);
    });

    it("scarta le righe che non seguono il formato atteso", async () => {
        readFile.mockResolvedValue(
            ["riga completamente illeggibile", "2026-03-05T10:00:00.000Z | ip=1.2.3.4 | action=login | status=200"].join(
                "\n"
            )
        );

        const entries = await readLogEntries("2026-03-05");

        expect(entries).toHaveLength(1);
        expect(entries[0].action).toBe("login");
    });
});

describe("listLogFiles", () => {
    it("cartella dei log assente: lista vuota, nessun errore", async () => {
        readdir.mockRejectedValue(new Error("ENOENT"));

        await expect(listLogFiles()).resolves.toEqual([]);
    });

    it("elenca solo i file giornalieri, ordinati dal più recente", async () => {
        readdir.mockResolvedValue([
            direntFile("user-actions-2026-03-01.log"),
            direntFile("user-actions-2026-03-05.log"),
            direntFile("altro-file.txt"),
            { name: "sottocartella", isFile: () => false, isDirectory: () => true },
        ]);
        stat.mockImplementation(async (filePath: string) => ({
            size: filePath.includes("03-05") ? 100 : 50,
            mtime: new Date("2026-03-05T00:00:00.000Z"),
        }));

        const files = await listLogFiles();

        expect(files).toEqual([
            { dayKey: "2026-03-05", sizeBytes: 100, updatedAt: "2026-03-05T00:00:00.000Z" },
            { dayKey: "2026-03-01", sizeBytes: 50, updatedAt: "2026-03-05T00:00:00.000Z" },
        ]);
    });
});

describe("appendUserActionLog", () => {
    /**
     * Il cleanup gira solo quando cambia il "giorno di ultima pulizia" (stato di modulo),
     * non a ogni scrittura: altrimenti ogni singola richiesta rileggerebbe la cartella dei
     * log. Un solo test in sequenza, perché quello stato non è resettabile fra i test.
     */
    it("pulisce i log vecchi solo al cambio di giorno, non a ogni scrittura sullo stesso giorno", async () => {
        const ottoFileVecchi = Array.from({ length: 8 }, (_, i) =>
            direntFile(`user-actions-2026-02-${String(i + 1).padStart(2, "0")}.log`)
        );
        readdir.mockResolvedValue(ottoFileVecchi);

        await appendUserActionLog("prima riga\n", "2026-03-05");

        expect(readdir).toHaveBeenCalledTimes(1);
        expect(unlink).toHaveBeenCalledTimes(1);
        expect(appendFile).toHaveBeenCalledWith(expect.stringMatching(/user-actions-2026-03-05\.log$/), "prima riga\n");

        readdir.mockClear();
        unlink.mockClear();

        await appendUserActionLog("seconda riga\n", "2026-03-05");

        expect(readdir).not.toHaveBeenCalled();

        readdir.mockResolvedValue(ottoFileVecchi);
        await appendUserActionLog("terza riga\n", "2026-03-06");

        expect(readdir).toHaveBeenCalledTimes(1);
    });
});
