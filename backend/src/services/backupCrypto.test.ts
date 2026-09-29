import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupManagerError } from "./backupError";
import { BackupDecryptAuthError, decryptArchiveFile, encryptArchiveFile, isEncryptedArchiveFile } from "./backupCrypto";
import { exportBackupKey, invalidateBackupKeyCache } from "./backupKey";

// Cartella per la chiave solo di questo file, al posto del `data/` vero: `data/backup.key` lo
// creano e cancellano anche altri file di test in parallelo (vedi `backupKey.test.ts`).
// `createKeyFile` legge `process.cwd()` all'import, quindi il finto `cwd` va pronto prima degli
// import: `vi.hoisted` gira prima di tutti.
const { keyRoot, cwdSpy } = vi.hoisted(() => {
    const nodeFs = process.getBuiltinModule("node:fs");
    const nodeOs = process.getBuiltinModule("node:os");
    const nodePath = process.getBuiltinModule("node:path");
    const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "backup-crypto-key-"));

    return { keyRoot: dir, cwdSpy: vi.spyOn(process, "cwd").mockReturnValue(dir) };
});

// Vero I/O su disco e vera cifratura: qui interessa che lo streaming produca esattamente
// gli stessi byte in ingresso, non solo che le chiamate ai mock combacino.
const keyFilePath = path.join(process.cwd(), "data", "backup.key");
let tempDir: string;

afterAll(async () => {
    cwdSpy.mockRestore();
    await fs.promises.rm(keyRoot, { recursive: true, force: true });
});

beforeEach(async () => {
    invalidateBackupKeyCache();
    await fs.promises.rm(keyFilePath, { force: true });
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "backup-crypto-test-"));
});

afterEach(async () => {
    invalidateBackupKeyCache();
    await fs.promises.rm(keyFilePath, { force: true });
    await fs.promises.rm(tempDir, { recursive: true, force: true });
});

const writeSource = async (content: string) => {
    const sourcePath = path.join(tempDir, "plain.tar.gz");
    await fs.promises.writeFile(sourcePath, content);
    return sourcePath;
};

describe("encryptArchiveFile / decryptArchiveFile", () => {
    it("decifra esattamente ciò che ha cifrato, byte per byte", async () => {
        const content = "contenuto di prova, ripetuto ".repeat(1000);
        const sourcePath = await writeSource(content);
        const encryptedPath = path.join(tempDir, "archive.tar.gz");
        const decryptedPath = path.join(tempDir, "restored.tar.gz");

        await encryptArchiveFile(sourcePath, encryptedPath);
        await decryptArchiveFile(encryptedPath, decryptedPath);

        const restored = await fs.promises.readFile(decryptedPath, "utf-8");
        expect(restored).toBe(content);
    });

    it("l'archivio cifrato non contiene il contenuto in chiaro", async () => {
        const content = "dato-riconoscibile-nel-dump";
        const sourcePath = await writeSource(content);
        const encryptedPath = path.join(tempDir, "archive.tar.gz");

        await encryptArchiveFile(sourcePath, encryptedPath);

        const encryptedBytes = await fs.promises.readFile(encryptedPath);
        expect(encryptedBytes.includes(content)).toBe(false);
    });

    it("una chiave esplicita diversa da quella locale non decifra l'archivio", async () => {
        const sourcePath = await writeSource("contenuto");
        const encryptedPath = path.join(tempDir, "archive.tar.gz");
        const decryptedPath = path.join(tempDir, "restored.tar.gz");

        await encryptArchiveFile(sourcePath, encryptedPath);

        const wrongKey = Buffer.alloc(32, 7);
        await expect(decryptArchiveFile(encryptedPath, decryptedPath, wrongKey)).rejects.toThrow(
            BackupDecryptAuthError
        );
    });

    it("una chiave esplicita uguale a quella locale decifra correttamente (caso: chiave esportata e reincollata)", async () => {
        const content = "contenuto-per-il-round-trip-con-chiave-esplicita";
        const sourcePath = await writeSource(content);
        const encryptedPath = path.join(tempDir, "archive.tar.gz");
        const decryptedPath = path.join(tempDir, "restored.tar.gz");

        await encryptArchiveFile(sourcePath, encryptedPath);
        const sameKey = Buffer.from(await exportBackupKey(), "hex");

        await decryptArchiveFile(encryptedPath, decryptedPath, sameKey);

        expect(await fs.promises.readFile(decryptedPath, "utf-8")).toBe(content);
    });

    it("un file manomesso viene rifiutato invece di essere decifrato a metà", async () => {
        const sourcePath = await writeSource("contenuto originale");
        const encryptedPath = path.join(tempDir, "archive.tar.gz");
        const decryptedPath = path.join(tempDir, "restored.tar.gz");

        await encryptArchiveFile(sourcePath, encryptedPath);

        const bytes = await fs.promises.readFile(encryptedPath);
        bytes[bytes.length - 20] ^= 0xff;
        await fs.promises.writeFile(encryptedPath, bytes);

        await expect(decryptArchiveFile(encryptedPath, decryptedPath)).rejects.toThrow(BackupDecryptAuthError);
    });

    it("rifiuta un file troppo corto per contenere intestazione e auth tag", async () => {
        const truncatedPath = path.join(tempDir, "troppo-corto.tar.gz");
        await fs.promises.writeFile(truncatedPath, Buffer.from("MWB1"));

        await expect(decryptArchiveFile(truncatedPath, path.join(tempDir, "out.tar.gz"))).rejects.toThrow(
            BackupManagerError
        );
    });
});

describe("isEncryptedArchiveFile", () => {
    it("riconosce un archivio cifrato dal magic in testa al file", async () => {
        const sourcePath = await writeSource("contenuto");
        const encryptedPath = path.join(tempDir, "archive.tar.gz");
        await encryptArchiveFile(sourcePath, encryptedPath);

        expect(await isEncryptedArchiveFile(encryptedPath)).toBe(true);
    });

    it("non scambia un archivio gzip in chiaro (formato storico) per uno cifrato", async () => {
        const plainGzipPath = path.join(tempDir, "legacy.tar.gz");
        // Non serve un gzip vero: bastano i primi byte, diversi dal magic "MWB1".
        await fs.promises.writeFile(plainGzipPath, Buffer.from([0x1f, 0x8b, 0x08, 0x00]));

        expect(await isEncryptedArchiveFile(plainGzipPath)).toBe(false);
    });
});
