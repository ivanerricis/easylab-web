import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsPromisesMock = vi.hoisted(() => ({
    mkdir: vi.fn(),
    cp: vi.fn(),
    rm: vi.fn(),
}));

vi.mock("node:fs", () => ({
    default: { promises: fsPromisesMock },
}));

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const backupCryptoMock = vi.hoisted(() => ({ encryptArchiveFile: vi.fn() }));

vi.mock("./backupCrypto", () => backupCryptoMock);

import { BackupManagerError } from "./backupError";
import { archiveDataEntry, archiveDumpEntry, backedUpDataEntries } from "./backupFiles";
import { createBackupArchive, resetPublicSchema, runPgDump, runPsql, runTar } from "./backupProcess";

// Fake child_process minimale: i tre helper usano solo stderr + gli eventi error/close.
class FakeChild extends EventEmitter {
    stderr = new EventEmitter();
}

// Fa chiudere il processo con successo al giro di eventi successivo, cosi' le chiamate
// sequenziali dentro createBackupArchive (pg_dump poi tar) restano indipendenti.
const autoSucceed = () => {
    const child = new FakeChild();
    setImmediate(() => child.emit("close", 0));
    return child;
};

const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://dbuser:dbpass@dbhost:5433/labdb";
    fsPromisesMock.mkdir.mockResolvedValue(undefined);
    fsPromisesMock.cp.mockResolvedValue(undefined);
    fsPromisesMock.rm.mockResolvedValue(undefined);
    backupCryptoMock.encryptArchiveFile.mockResolvedValue(undefined);
});

afterEach(() => {
    if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
    } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
    }
});

describe("parseDatabaseUrl (via runPgDump)", () => {
    it("rifiuta quando DATABASE_URL non e' configurata", async () => {
        delete process.env.DATABASE_URL;

        await expect(runPgDump("/tmp/out.sql")).rejects.toThrow("Variabile DATABASE_URL non configurata");
        expect(spawnMock).not.toHaveBeenCalled();
    });

    it("rifiuta una DATABASE_URL non parsabile come URL", async () => {
        process.env.DATABASE_URL = "non-una-url";

        await expect(runPgDump("/tmp/out.sql")).rejects.toThrow("DATABASE_URL non valida");
    });

    it("rifiuta una DATABASE_URL senza nome database", async () => {
        process.env.DATABASE_URL = "postgres://dbuser:dbpass@dbhost:5433/";

        await expect(runPgDump("/tmp/out.sql")).rejects.toThrow("Nome database mancante in DATABASE_URL");
    });
});

describe("runPgDump", () => {
    it("risolve quando pg_dump esce con codice 0", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runPgDump("/tmp/out.sql");
        const child = spawnMock.mock.results[0].value as FakeChild;
        child.emit("close", 0);

        await expect(promise).resolves.toBeUndefined();
        expect(spawnMock).toHaveBeenCalledWith(
            "pg_dump",
            expect.arrayContaining(["-h", "dbhost", "-p", "5433", "-U", "dbuser", "-d", "labdb", "-f", "/tmp/out.sql"]),
            expect.objectContaining({ env: expect.objectContaining({ PGPASSWORD: "dbpass" }) })
        );
    });

    it("traduce ENOENT nel messaggio 'pg_dump non trovato'", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runPgDump("/tmp/out.sql");
        const child = spawnMock.mock.results[0].value as FakeChild;
        const error = new Error("spawn pg_dump ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        child.emit("error", error);

        await expect(promise).rejects.toThrow("pg_dump non trovato");
    });

    it("usa lo stderr come messaggio quando il codice di uscita non e' 0", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runPgDump("/tmp/out.sql");
        const child = spawnMock.mock.results[0].value as FakeChild;
        child.stderr.emit("data", Buffer.from("connessione rifiutata"));
        child.emit("close", 1);

        await expect(promise).rejects.toThrow("connessione rifiutata");
    });

    it("ripiega sul codice di uscita quando pg_dump non scrive nulla su stderr", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runPgDump("/tmp/out.sql");
        const child = spawnMock.mock.results[0].value as FakeChild;
        child.emit("close", 2);

        await expect(promise).rejects.toThrow("pg_dump terminato con codice 2");
    });
});

describe("runTar", () => {
    it("traduce ENOENT nel messaggio 'tar non trovato'", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runTar(["-czf", "/tmp/a.tar.gz"]);
        const child = spawnMock.mock.results[0].value as FakeChild;
        const error = new Error("spawn tar ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        child.emit("error", error);

        await expect(promise).rejects.toThrow("tar non trovato");
    });

    it("risolve quando tar esce con codice 0", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runTar(["-czf", "/tmp/a.tar.gz"]);
        const child = spawnMock.mock.results[0].value as FakeChild;
        child.emit("close", 0);

        await expect(promise).resolves.toBeUndefined();
    });
});

describe("runPsql / resetPublicSchema", () => {
    it("passa host/porta/utente/database e la password via PGPASSWORD", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runPsql(["-f", "/tmp/dump.sql"]);
        const child = spawnMock.mock.results[0].value as FakeChild;
        child.emit("close", 0);
        await promise;

        expect(spawnMock).toHaveBeenCalledWith(
            "psql",
            expect.arrayContaining([
                "-h",
                "dbhost",
                "-U",
                "dbuser",
                "-d",
                "labdb",
                "-v",
                "ON_ERROR_STOP=1",
                "-f",
                "/tmp/dump.sql",
            ]),
            expect.objectContaining({ env: expect.objectContaining({ PGPASSWORD: "dbpass" }) })
        );
    });

    it("traduce ENOENT nel messaggio 'psql non trovato'", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = runPsql(["-c", "select 1"]);
        const child = spawnMock.mock.results[0].value as FakeChild;
        const error = new Error("spawn psql ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        child.emit("error", error);

        await expect(promise).rejects.toThrow("psql non trovato");
    });

    // Regressione: drizzle traccia le migrazioni nello schema "drizzle", ricreato a ogni
    // avvio del container. Se il reset dimentica di ripulirlo anche lui, dopo un ripristino
    // drizzle crede che le migrazioni siano gia' applicate e non ricrea lo schema public.
    it("il reset dello schema pubblico ripulisce anche lo schema drizzle", async () => {
        spawnMock.mockImplementation(() => new FakeChild());

        const promise = resetPublicSchema();
        const child = spawnMock.mock.results[0].value as FakeChild;
        child.emit("close", 0);
        await promise;

        const args = spawnMock.mock.calls[0][1] as string[];
        expect(args.join(" ")).toContain("DROP SCHEMA IF EXISTS drizzle CASCADE");
        expect(args.join(" ")).toContain("DROP SCHEMA public CASCADE");
    });
});

describe("createBackupArchive", () => {
    it("assembla dump e dati in una cartella temporanea, poi la comprime, la cifra e ripulisce lo staging", async () => {
        spawnMock.mockImplementation(() => autoSucceed());

        const archivePath = path.join("backups", "db-backup-20260729-113813.tar.gz");
        await createBackupArchive(archivePath);

        expect(spawnMock).toHaveBeenCalledTimes(2);
        expect(spawnMock.mock.calls[0][0]).toBe("pg_dump");
        expect(spawnMock.mock.calls[1][0]).toBe("tar");

        // Il tar in chiaro finisce in un file temporaneo dentro lo staging, mai in
        // `archivePath` direttamente: quello lo scrive `encryptArchiveFile`.
        const tarArgs = spawnMock.mock.calls[1][1] as string[];
        expect(tarArgs).toEqual(
            expect.arrayContaining(["-czf", expect.any(String), "-C", expect.any(String), archiveDumpEntry, archiveDataEntry])
        );
        const plainArchivePath = tarArgs[1];
        expect(plainArchivePath).not.toBe(archivePath);

        expect(backupCryptoMock.encryptArchiveFile).toHaveBeenCalledWith(plainArchivePath, archivePath);

        // Ogni voce configurata viene copiata nella cartella dati di staging.
        expect(fsPromisesMock.cp).toHaveBeenCalledTimes(backedUpDataEntries.length);

        // La cartella temporanea va rimossa sempre, anche quando tutto va bene.
        expect(fsPromisesMock.rm).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ recursive: true, force: true })
        );
    });

    it("ignora silenziosamente le voci dati assenti (es. email mai configurata)", async () => {
        spawnMock.mockImplementation(() => autoSucceed());
        fsPromisesMock.cp.mockRejectedValue(new Error("ENOENT"));

        await expect(createBackupArchive("/tmp/out.tar.gz")).resolves.toBeUndefined();
    });

    it("pulisce la cartella temporanea anche se pg_dump fallisce", async () => {
        spawnMock.mockImplementationOnce(() => {
            const child = new FakeChild();
            setImmediate(() => {
                child.stderr.emit("data", Buffer.from("connessione rifiutata"));
                child.emit("close", 1);
            });
            return child;
        });

        await expect(createBackupArchive("/tmp/out.tar.gz")).rejects.toThrow(BackupManagerError);
        expect(fsPromisesMock.rm).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ recursive: true, force: true })
        );
        // Il fallimento e' avvenuto prima del passo tar.
        expect(spawnMock).toHaveBeenCalledTimes(1);
    });
});
