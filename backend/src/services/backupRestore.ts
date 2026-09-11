/**
 * Ripristino del database da un backup esistente o da un file caricato.
 */
import fs from "node:fs";
import path from "node:path";
import { BackupManagerError } from "./backupError";
import {
    archiveDataEntry,
    archiveDumpEntry,
    backedUpDataEntries,
    getBackupDumpPath,
    isArchiveFileName,
    settingsDir,
} from "./backupFiles";
import { assertNoOperationInProgress, beginRestore, endRestore } from "./backupLock";
import { resetPublicSchema, runPsql, runTar } from "./backupProcess";
import { BackupDecryptAuthError, decryptArchiveFile, isEncryptedArchiveFile } from "./backupCrypto";
import { decodeBackupKeyOverride, setBackupKey } from "./backupKey";
import {
    findSecretsToReconfigure,
    invalidateBackupStateCache,
    loadState,
    persistState,
    toPublicState,
} from "./backupState";
import { invalidateCompanySettingsCache } from "./companyManager";
import { invalidateEmailSettingsCache } from "./emailManager";

// Estrae l'archivio e restituisce dove trovare dump e impostazioni. Per il formato
// storico (.sql puro) non c'è nulla da estrarre e non ci sono impostazioni.
const prepareRestoreSource = async (filePath: string, sourceFileName: string, backupKeyOverride?: string) => {
    if (!isArchiveFileName(sourceFileName)) {
        return { sqlPath: filePath, dataDir: null as string | null, cleanup: async () => {} };
    }

    const extractDir = path.join(settingsDir, `tmp-extract-${Date.now()}`);
    await fs.promises.mkdir(extractDir, { recursive: true });

    try {
        let tarSourcePath = filePath;

        if (await isEncryptedArchiveFile(filePath)) {
            const overrideKey = backupKeyOverride ? decodeBackupKeyOverride(backupKeyOverride) : undefined;
            tarSourcePath = path.join(extractDir, "archive.tar.gz");

            try {
                await decryptArchiveFile(filePath, tarSourcePath, overrideKey);
            } catch (error) {
                if (!(error instanceof BackupDecryptAuthError)) {
                    throw error;
                }

                throw new BackupManagerError(
                    backupKeyOverride
                        ? "La chiave di backup inserita non è corretta per questo archivio"
                        : "Questo archivio è cifrato con una chiave diversa da quella presente su questo server. " +
                              "Se il backup proviene da un altro server, incolla qui la chiave di backup esportata da lì.",
                    400
                );
            }

            // La chiave incollata ha decifrato con successo: da questo momento è quella
            // "giusta" anche per i prossimi backup su questo server (il caso tipico è un
            // ripristino su una macchina nuova, con una data/backup.key diversa o assente).
            if (backupKeyOverride) {
                await setBackupKey(backupKeyOverride);
            }
        }

        await runTar(["-xzf", tarSourcePath, "-C", extractDir]);
    } catch (error) {
        await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
        throw error;
    }

    const sqlPath = path.join(extractDir, archiveDumpEntry);

    try {
        await fs.promises.access(sqlPath);
    } catch {
        await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
        throw new BackupManagerError(`Archivio non valido: manca ${archiveDumpEntry}`, 400);
    }

    return {
        sqlPath,
        dataDir: path.join(extractDir, archiveDataEntry),
        cleanup: async () => {
            await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
        },
    };
};

// Riporta le impostazioni dell'archivio in data/. `secret.key` non è nell'archivio
// e non viene toccata: quella presente sulla macchina resta valida.
const restoreDataEntries = async (dataDir: string) => {
    for (const entry of backedUpDataEntries) {
        const source = path.join(dataDir, entry);

        try {
            await fs.promises.access(source);
        } catch {
            continue;
        }

        await fs.promises.rm(path.join(settingsDir, entry), { recursive: true, force: true }).catch(() => {});
        await fs.promises.cp(source, path.join(settingsDir, entry), { recursive: true });
    }

    // I file sono cambiati sotto le cache in memoria dei tre manager.
    invalidateBackupStateCache();
    invalidateEmailSettingsCache();
    invalidateCompanySettingsCache();
};

const performRestore = async (
    filePath: string,
    resetSchema: boolean,
    sourceFileName: string,
    backupKeyOverride?: string
) => {
    let state = await loadState();

    assertNoOperationInProgress();

    beginRestore();
    const now = new Date();
    let source: Awaited<ReturnType<typeof prepareRestoreSource>> | undefined;

    try {
        source = await prepareRestoreSource(filePath, sourceFileName, backupKeyOverride);

        if (resetSchema) {
            await resetPublicSchema();
        }

        await runPsql(["-f", source.sqlPath]);

        if (source.dataDir) {
            await restoreDataEntries(source.dataDir);
            // Le impostazioni appena riportate hanno sostituito quelle in memoria:
            // i campi di esito vanno scritti sopra lo stato ripristinato.
            state = await loadState();
        }

        const secretsToReconfigure = await findSecretsToReconfigure(state);

        state.lastRestoreAt = now.toISOString();
        state.lastRestoreStatus = "success";
        state.lastRestoreError = null;
        state.lastRestoreFileName = sourceFileName;
        await persistState(state);

        return {
            ...(await toPublicState(state)),
            message:
                secretsToReconfigure.length > 0
                    ? `Ripristino completato. Reinserisci a mano: ${secretsToReconfigure.join(", ")}.`
                    : "Ripristino completato con successo",
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Errore durante il ripristino del database";
        state.lastRestoreAt = now.toISOString();
        state.lastRestoreStatus = "failed";
        state.lastRestoreError = message;
        state.lastRestoreFileName = sourceFileName;
        await persistState(state);

        throw error;
    } finally {
        endRestore();
        await source?.cleanup();
    }
};

export const restoreBackupFromExisting = async (fileName: string, resetSchema: boolean, backupKeyOverride?: string) => {
    const filePath = await getBackupDumpPath(fileName);
    return performRestore(filePath, resetSchema, fileName, backupKeyOverride);
};

const uploadedDumpNamePattern = /\.(sql|tar\.gz)$/i;

export const restoreBackupFromUpload = async (
    buffer: Buffer,
    originalFileName: string,
    resetSchema: boolean,
    backupKeyOverride?: string
) => {
    if (!uploadedDumpNamePattern.test(originalFileName)) {
        throw new BackupManagerError("Il file caricato deve avere estensione .sql o .tar.gz", 400);
    }

    const tempDir = path.join(process.cwd(), "data", "tmp-restore");
    await fs.promises.mkdir(tempDir, { recursive: true });
    const suffix = isArchiveFileName(originalFileName) ? "tar.gz" : "sql";
    const tempFilePath = path.join(tempDir, `upload-${Date.now()}.${suffix}`);

    await fs.promises.writeFile(tempFilePath, buffer);

    try {
        return await performRestore(tempFilePath, resetSchema, originalFileName, backupKeyOverride);
    } finally {
        await fs.promises.unlink(tempFilePath).catch(() => {});
    }
};
