import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
