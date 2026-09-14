import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupManagerError } from "./backupError";
import {
    decodeBackupKeyOverride,
    exportBackupKey,
    getOrCreateBackupKey,
    invalidateBackupKeyCache,
    setBackupKey,
} from "./backupKey";

const keyFilePath = path.join(process.cwd(), "data", "backup.key");

beforeEach(async () => {
    invalidateBackupKeyCache();
    await fs.promises.rm(keyFilePath, { force: true });
});

afterEach(async () => {
    invalidateBackupKeyCache();
    await fs.promises.rm(keyFilePath, { force: true });
});

describe("getOrCreateBackupKey", () => {
    it("genera una chiave al primo utilizzo e la persiste su disco", async () => {
        const key = await getOrCreateBackupKey();

        expect(key).toHaveLength(32);
        const onDisk = await fs.promises.readFile(keyFilePath, "utf-8");
        expect(Buffer.from(onDisk.trim(), "hex")).toEqual(key);
    });

    it("riusa la stessa chiave a chiamate successive, anche dopo aver svuotato la cache", async () => {
        const first = await getOrCreateBackupKey();
        invalidateBackupKeyCache();
        const second = await getOrCreateBackupKey();

        expect(second).toEqual(first);
    });
});

/**
 * Con `node:fs` finto, non sul `data/backup.key` vero: quel file lo creano e cancellano anche
 * altri file di test che girano in parallelo, e un test che scrive e rilegge lo stesso percorso
 * finirebbe per leggere quello che un altro ha appena tolto.
 *
 * Il buco che questi test chiudono: prima un file illeggibile veniva sostituito da una chiave
 * nuova, mai esportata, e la copia custodita dall'admin smetteva di aprire i backup.
 */
describe("getOrCreateBackupKey, file presente ma inutilizzabile", () => {
    const readFile = vi.fn();
    const writeFile = vi.fn();
    const mkdir = vi.fn();

    const loadModule = async () => {
        vi.resetModules();
        vi.doMock("node:fs", () => {
            const promises = { readFile, writeFile, mkdir };
            return { default: { promises }, promises };
        });
        return import("./backupKey.js");
    };

    beforeEach(() => {
        readFile.mockReset();
        writeFile.mockReset().mockResolvedValue(undefined);
        mkdir.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.doUnmock("node:fs");
        vi.resetModules();
    });

    it("senza una chiave valida dentro fallisce senza sovrascriverlo", async () => {
        readFile.mockResolvedValue("non-una-chiave\n");
        const { getOrCreateBackupKey: load } = await loadModule();

        await expect(load()).rejects.toMatchObject({ statusCode: 500 });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("con un errore di lettura diverso dal file mancante fallisce senza scrivere niente", async () => {
        readFile.mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }));
        const { getOrCreateBackupKey: load } = await loadModule();

        await expect(load()).rejects.toMatchObject({ code: "EACCES" });
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("se il file manca lo crea senza poter scrivere sopra uno comparso nel frattempo", async () => {
        readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        const { getOrCreateBackupKey: load } = await loadModule();

        await load();

        expect(writeFile).toHaveBeenCalledWith(
            keyFilePath,
            expect.stringMatching(/^[0-9a-f]{64}\n$/),
            expect.objectContaining({ mode: 0o600, flag: "wx" })
        );
    });
});

describe("exportBackupKey", () => {
    it("restituisce la chiave come stringa esadecimale di 64 caratteri", async () => {
        const hex = await exportBackupKey();

        expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("decodeBackupKeyOverride", () => {
    it("decodifica una chiave esadecimale valida", () => {
        const hex = "ab".repeat(32);

        expect(decodeBackupKeyOverride(hex)).toEqual(Buffer.from(hex, "hex"));
    });

    it("rifiuta una chiave di lunghezza sbagliata", () => {
        expect(() => decodeBackupKeyOverride("ab")).toThrow(BackupManagerError);
    });
});

describe("setBackupKey", () => {
    it("sostituisce la chiave locale e la rende quella usata dalle chiamate successive", async () => {
        await getOrCreateBackupKey();
        const pasted = "cd".repeat(32);

        await setBackupKey(pasted);

        expect(await exportBackupKey()).toBe(pasted);

        invalidateBackupKeyCache();
        expect(await exportBackupKey()).toBe(pasted);
    });

    it("rifiuta una chiave malformata senza toccare quella salvata", async () => {
        await getOrCreateBackupKey();
        const before = await exportBackupKey();

        await expect(setBackupKey("non-esadecimale")).rejects.toThrow(BackupManagerError);

        expect(await exportBackupKey()).toBe(before);
    });
});
