/**
 * Invocazione dei comandi esterni usati dal backup: pg_dump, psql e tar. Tutto ciò che
 * riguarda `spawn`, i codici di uscita e la traduzione degli errori in messaggi per
 * l'utente sta qui.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { BackupManagerError } from "./backupError";
import { encryptArchiveFile } from "./backupCrypto";
import { archiveDataEntry, archiveDumpEntry, backedUpDataEntries, settingsDir } from "./backupFiles";

const parseDatabaseUrl = () => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new BackupManagerError("Variabile DATABASE_URL non configurata", 500);
    }

    let parsed: URL;

    try {
        parsed = new URL(databaseUrl);
    } catch {
        throw new BackupManagerError("DATABASE_URL non valida", 500);
    }

    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

    if (!databaseName) {
        throw new BackupManagerError("Nome database mancante in DATABASE_URL", 500);
    }

    return {
        host: parsed.hostname,
        port: parsed.port || "5432",
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        databaseName,
    };
};

export const runPgDump = async (outputPath: string) => {
    const { host, port, user, password, databaseName } = parseDatabaseUrl();

    const args = [
        "--no-owner",
        "--no-privileges",
        "--format=plain",
        "--encoding=UTF8",
        "-h",
        host,
        "-p",
        port,
        "-U",
        user,
        "-d",
        databaseName,
        "-f",
        outputPath,
    ];

    const env = {
        ...process.env,
        PGPASSWORD: password,
    };

    await new Promise<void>((resolve, reject) => {
        const child = spawn("pg_dump", args, { env });
        let stderr = "";

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                reject(new BackupManagerError("pg_dump non trovato. Installa postgresql-client nel backend", 500));
                return;
            }

            reject(new BackupManagerError(`Errore avvio pg_dump: ${error.message}`, 500));
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            const message = stderr.trim() || `pg_dump terminato con codice ${code}`;
            reject(new BackupManagerError(message, 500));
        });
    });
};

export const runTar = async (args: string[]) => {
    await new Promise<void>((resolve, reject) => {
        const child = spawn("tar", args);
        let stderr = "";

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                reject(new BackupManagerError("tar non trovato nel container backend", 500));
                return;
            }

            reject(new BackupManagerError(`Errore avvio tar: ${error.message}`, 500));
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new BackupManagerError(stderr.trim() || `tar terminato con codice ${code}`, 500));
        });
    });
};

// Assembla dump + impostazioni in una cartella temporanea, la comprime e cifra il
// risultato. Il tar intermedio (in chiaro) resta dentro `stagingDir` e non arriva mai a
// destinazione: solo l'archivio cifrato, prodotto da `encryptArchiveFile`, finisce in
// `archivePath`.
export const createBackupArchive = async (archivePath: string) => {
    const stagingDir = path.join(settingsDir, `tmp-backup-${Date.now()}`);
    const stagingDataDir = path.join(stagingDir, archiveDataEntry);
    const plainArchivePath = path.join(stagingDir, "archive.tar.gz");

    try {
        await fs.promises.mkdir(stagingDataDir, { recursive: true });
        await runPgDump(path.join(stagingDir, archiveDumpEntry));

        for (const entry of backedUpDataEntries) {
            // `force: false` di default: le voci assenti (es. email mai configurata)
            // vengono semplicemente saltate.
            await fs.promises
                .cp(path.join(settingsDir, entry), path.join(stagingDataDir, entry), { recursive: true })
                .catch(() => {});
        }

        await runTar(["-czf", plainArchivePath, "-C", stagingDir, archiveDumpEntry, archiveDataEntry]);

        await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
        await encryptArchiveFile(plainArchivePath, archivePath);
    } finally {
        await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
};

export const runPsql = async (args: string[]) => {
    const { host, port, user, password, databaseName } = parseDatabaseUrl();

    const fullArgs = ["-h", host, "-p", port, "-U", user, "-d", databaseName, "-v", "ON_ERROR_STOP=1", ...args];

    const env = {
        ...process.env,
        PGPASSWORD: password,
    };

    await new Promise<void>((resolve, reject) => {
        const child = spawn("psql", fullArgs, { env });
        let stderr = "";

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                reject(new BackupManagerError("psql non trovato. Installa postgresql-client nel backend", 500));
                return;
            }

            reject(new BackupManagerError(`Errore avvio psql: ${error.message}`, 500));
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            const message = stderr.trim() || `psql terminato con codice ${code}`;
            reject(new BackupManagerError(message, 500));
        });
    });
};

export const resetPublicSchema = async () => {
    // Il dump include anche lo schema "drizzle" (tracking migrazioni di drizzle-orm), che il
    // container backend ricrea ad ogni avvio: va svuotato anche lui, non solo "public".
    await runPsql([
        "-c",
        "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;",
    ]);
};
