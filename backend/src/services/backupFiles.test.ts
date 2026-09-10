import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsPromisesMock = vi.hoisted(() => ({
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn(),
}));

vi.mock("node:fs", () => ({
    default: { promises: fsPromisesMock },
}));

import { BackupManagerError } from "./backupError";
import {
    backupFileNameScanPattern,
    buildArchiveFilePath,
    getBackupDumpPath,
    isArchiveFileName,
    isBackupFileName,
    listBackupDumps,
    pruneOldBackups,
    toAbsoluteOutputDir,
} from "./backupFiles";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("isBackupFileName", () => {
    it("accetta il formato storico .sql e quello nuovo .tar.gz", () => {
        expect(isBackupFileName("db-dump-20260101-000000.sql")).toBe(true);
        expect(isBackupFileName("db-backup-20260101-000000.tar.gz")).toBe(true);
    });

    it("rifiuta prefissi, estensioni o date che non seguono lo schema", () => {
        expect(isBackupFileName("dump-20260101-000000.sql")).toBe(false);
        expect(isBackupFileName("db-backup-20260101-000000.zip")).toBe(false);
        expect(isBackupFileName("db-dump-2026-01-01.sql")).toBe(false);
    });
});

describe("isArchiveFileName", () => {
    it("riconosce solo .tar.gz, senza distinguere maiuscole/minuscole", () => {
        expect(isArchiveFileName("db-backup-20260101-000000.tar.gz")).toBe(true);
        expect(isArchiveFileName("db-backup-20260101-000000.TAR.GZ")).toBe(true);
        expect(isArchiveFileName("db-dump-20260101-000000.sql")).toBe(false);
    });
});

describe("backupFileNameScanPattern", () => {
    // Usato su testo libero (l'output di `smbclient ls`), non su un nome isolato: deve
    // estrarre solo le occorrenze valide e ignorare il resto della riga.
    it("estrae entrambi i formati da un blocco di testo", () => {
        const lsOutput = [
            "  db-backup-20260729-113813.tar.gz   123456  Wed Jul 29 11:38:13 2026",
            "  db-dump-20260701-020000.sql          98765  Wed Jul  1 02:00:00 2026",
            "  .                                        0",
            "  ..                                       0",
        ].join("\n");

        expect(lsOutput.match(backupFileNameScanPattern)).toEqual([
            "db-backup-20260729-113813.tar.gz",
            "db-dump-20260701-020000.sql",
        ]);
    });

    it("non trova nulla quando non ci sono backup nel testo", () => {
        expect("cartella vuota".match(backupFileNameScanPattern)).toBeNull();
    });
});

describe("toAbsoluteOutputDir", () => {
    it("lascia invariato un percorso gia' assoluto", () => {
        const absolute = path.resolve("/var/backups");
        expect(toAbsoluteOutputDir(absolute)).toBe(absolute);
    });

    it("risolve un percorso relativo rispetto alla cwd del processo", () => {
        expect(toAbsoluteOutputDir("backups")).toBe(path.join(process.cwd(), "backups"));
    });
});

describe("buildArchiveFilePath", () => {
    it("compone il nome dell'archivio dal timestamp locale", () => {
        const now = new Date(2026, 6, 29, 11, 38, 13);
        const result = buildArchiveFilePath("backups", now);

        expect(result).toBe(path.join(process.cwd(), "backups", "db-backup-20260729-113813.tar.gz"));
    });
});

describe("listBackupDumps", () => {
    it("torna vuoto se la cartella di output non esiste ancora", async () => {
        fsPromisesMock.readdir.mockRejectedValueOnce(new Error("ENOENT"));

        expect(await listBackupDumps()).toEqual([]);
    });

    it("filtra i file non-backup e ordina dal piu' recente al piu' vecchio", async () => {
        fsPromisesMock.readdir.mockResolvedValueOnce([
            "db-dump-20260701-020000.sql",
            "note.txt",
            "db-backup-20260729-113813.tar.gz",
        ]);
        fsPromisesMock.stat.mockImplementation(async (filePath: string) => ({
            size: filePath.includes("dump") ? 100 : 200,
            mtime: new Date("2026-01-01T00:00:00Z"),
        }));

        const result = await listBackupDumps();

        expect(result.map((f) => f.fileName)).toEqual([
            "db-backup-20260729-113813.tar.gz",
            "db-dump-20260701-020000.sql",
        ]);
        expect(result[0].sizeBytes).toBe(200);
        expect(fsPromisesMock.stat).toHaveBeenCalledTimes(2);
    });
});

describe("getBackupDumpPath", () => {
    it("rifiuta un nome file non valido senza toccare il filesystem", async () => {
        await expect(getBackupDumpPath("../../etc/passwd")).rejects.toThrow(BackupManagerError);
        expect(fsPromisesMock.access).not.toHaveBeenCalled();
    });

    it("torna il percorso assoluto quando il file esiste", async () => {
        fsPromisesMock.access.mockResolvedValueOnce(undefined);

        const result = await getBackupDumpPath("db-backup-20260729-113813.tar.gz");

        expect(result).toBe(path.join(process.cwd(), "backups", "db-backup-20260729-113813.tar.gz"));
    });

    it("segnala 404 quando il nome e' valido ma il file e' assente", async () => {
        fsPromisesMock.access.mockRejectedValueOnce(new Error("ENOENT"));

        try {
            await getBackupDumpPath("db-backup-20260729-113813.tar.gz");
            expect.unreachable("doveva lanciare");
        } catch (error) {
            expect(error).toBeInstanceOf(BackupManagerError);
            expect((error as BackupManagerError).statusCode).toBe(404);
        }
    });
});

describe("pruneOldBackups", () => {
    it("non fa nulla se la cartella non esiste", async () => {
        fsPromisesMock.readdir.mockRejectedValueOnce(new Error("ENOENT"));

        await pruneOldBackups("backups", 14);

        expect(fsPromisesMock.unlink).not.toHaveBeenCalled();
    });

    it("non cancella nulla se il numero di file e' sotto la soglia", async () => {
        fsPromisesMock.readdir.mockResolvedValueOnce(["db-backup-20260701-020000.tar.gz"]);

        await pruneOldBackups("backups", 14);

        expect(fsPromisesMock.unlink).not.toHaveBeenCalled();
    });

    // Regressione: il piu' recente non deve mai finire fra i cancellati.
    it("cancella solo i piu' vecchi oltre la retention, mai il piu' recente", async () => {
        fsPromisesMock.readdir.mockResolvedValueOnce([
            "db-dump-20260701-020000.sql",
            "db-backup-20260702-020000.tar.gz",
            "db-backup-20260703-020000.tar.gz",
        ]);
        fsPromisesMock.unlink.mockResolvedValue(undefined);

        await pruneOldBackups("backups", 2);

        expect(fsPromisesMock.unlink).toHaveBeenCalledTimes(1);
        expect(fsPromisesMock.unlink).toHaveBeenCalledWith(
            path.join(process.cwd(), "backups", "db-dump-20260701-020000.sql")
        );
    });

    it("ignora l'errore di cancellazione di un singolo file e non si interrompe", async () => {
        fsPromisesMock.readdir.mockResolvedValueOnce([
            "db-dump-20260701-020000.sql",
            "db-dump-20260702-020000.sql",
        ]);
        fsPromisesMock.unlink.mockRejectedValueOnce(new Error("EPERM"));

        await expect(pruneOldBackups("backups", 1)).resolves.toBeUndefined();
    });
});
