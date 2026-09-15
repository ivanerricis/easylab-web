import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdir = vi.fn();
const appendFile = vi.fn();
const readdir = vi.fn();
const unlink = vi.fn();
const stat = vi.fn();
const readFile = vi.fn();
const writeFile = vi.fn();

vi.mock("node:fs", () => {
    const promises = {
        mkdir: (...args: unknown[]) => mkdir(...args),
        appendFile: (...args: unknown[]) => appendFile(...args),
        readdir: (...args: unknown[]) => readdir(...args),
        unlink: (...args: unknown[]) => unlink(...args),
        stat: (...args: unknown[]) => stat(...args),
        readFile: (...args: unknown[]) => readFile(...args),
        writeFile: (...args: unknown[]) => writeFile(...args),
    };
    return { default: { promises }, promises };
});

import {
    LogManagerError,
    appendUserActionLog,
    getDayKey,
    getLogFilePath,
    getLogRetentionDays,
    listLogFiles,
    listRecentFailedLogins,
    readLogEntries,
    setLogRetentionDays,
} from "./logManager";

const direntFile = (name: string) => ({ name, isFile: () => true, isDirectory: () => false });

beforeEach(() => {
    vi.clearAllMocks();
    mkdir.mockResolvedValue(undefined);
    appendFile.mockResolvedValue(undefined);
    unlink.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
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
            [
                "riga completamente illeggibile",
                "2026-03-05T10:00:00.000Z | ip=1.2.3.4 | action=login | status=200",
            ].join("\n")
        );

        const entries = await readLogEntries("2026-03-05");

        expect(entries).toHaveLength(1);
        expect(entries[0].action).toBe("login");
    });
});

describe("listRecentFailedLogins", () => {
    it("attraversa i giorni dal più recente, tenendo solo gli accessi falliti", async () => {
        readdir.mockResolvedValue([
            direntFile("user-actions-2026-03-04.log"),
            direntFile("user-actions-2026-03-05.log"),
        ]);
        stat.mockResolvedValue({ size: 10, mtime: new Date("2026-03-05T00:00:00.000Z") });
        readFile.mockImplementation(async (filePath: unknown) => {
            if (String(filePath).includes("2026-03-05")) {
                return [
                    "2026-03-05T10:00:00.000Z | ip=1.2.3.4 | user=- | action=tentativo di accesso | status=401 | error=Nome utente o password non validi",
                    "2026-03-05T09:00:00.000Z | ip=1.2.3.4 | user=mario | action=creato /api/devices | status=201",
                    "2026-03-05T08:00:00.000Z | ip=5.6.7.8 | user=- | action=tentativo di accesso | status=200",
                ].join("\n");
            }

            return "2026-03-04T10:00:00.000Z | ip=9.9.9.9 | user=- | action=verifica codice 2FA in accesso | status=401 | error=Codice non valido";
        });

        const results = await listRecentFailedLogins();

        expect(results.map((entry) => entry.timestamp)).toEqual([
            "2026-03-05T10:00:00.000Z",
            "2026-03-04T10:00:00.000Z",
        ]);
        expect(results[0].error).toBe("Nome utente o password non validi");
    });

    it("si ferma al limite indicato senza leggere i giorni successivi", async () => {
        readdir.mockResolvedValue([
            direntFile("user-actions-2026-03-01.log"),
            direntFile("user-actions-2026-03-02.log"),
        ]);
        stat.mockResolvedValue({ size: 10, mtime: new Date("2026-03-02T00:00:00.000Z") });
        readFile.mockResolvedValue(
            [
                "2026-03-02T10:00:00.000Z | ip=1.2.3.4 | action=tentativo di accesso | status=401",
                "2026-03-02T09:00:00.000Z | ip=1.2.3.4 | action=tentativo di accesso | status=401",
            ].join("\n")
        );

        const results = await listRecentFailedLogins(1);

        expect(results).toHaveLength(1);
        expect(readFile).toHaveBeenCalledTimes(1);
    });

    it("salta un giorno il cui file non si legge, senza fermarsi", async () => {
        readdir.mockResolvedValue([
            direntFile("user-actions-2026-03-01.log"),
            direntFile("user-actions-2026-03-02.log"),
        ]);
        stat.mockResolvedValue({ size: 10, mtime: new Date("2026-03-02T00:00:00.000Z") });
        readFile.mockImplementation(async (filePath: unknown) => {
            if (String(filePath).includes("2026-03-02")) {
                throw new Error("ENOENT");
            }

            return "2026-03-01T10:00:00.000Z | ip=1.2.3.4 | action=tentativo di accesso | status=401";
        });

        const results = await listRecentFailedLogins();

        expect(results).toHaveLength(1);
        expect(results[0].timestamp).toBe("2026-03-01T10:00:00.000Z");
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

describe("getLogRetentionDays / setLogRetentionDays", () => {
    it("usa il default di 7 giorni quando non è stato ancora configurato nulla", async () => {
        readFile.mockRejectedValue(new Error("ENOENT"));

        await expect(getLogRetentionDays()).resolves.toBe(7);
    });

    it("rifiuta un valore fuori dall'intervallo 1-90", async () => {
        await expect(setLogRetentionDays(0)).rejects.toMatchObject({ statusCode: 400 });
        await expect(setLogRetentionDays(91)).rejects.toMatchObject({ statusCode: 400 });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("salva il nuovo valore e lo tiene in cache per le letture successive", async () => {
        const saved = await setLogRetentionDays(30);

        expect(saved).toEqual({ maxDays: 30 });
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/log-settings\.json$/),
            expect.stringContaining('"maxDays": 30'),
            "utf-8"
        );
        await expect(getLogRetentionDays()).resolves.toBe(30);

        // Riporta il default: il test di pulizia più sotto assume la retention originale di 7
        // giorni, e questo stato in memoria non si resetta fra i test dello stesso file.
        await setLogRetentionDays(7);
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
