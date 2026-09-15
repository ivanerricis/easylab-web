/**
 * Nomi, percorsi ed elenco dei file di backup su disco. Non conosce né le impostazioni
 * né i processi esterni: è il livello più basso, da cui dipendono tutti gli altri
 * moduli del backup.
 */
import fs from "node:fs";
import path from "node:path";
import { BackupManagerError } from "./backupError";

export const settingsDir = path.join(process.cwd(), "data");
export const settingsFilePath = path.join(settingsDir, "backup-settings.json");
export const defaultOutputDir = "backups";
export const defaultMaxBackupsToKeep = 14;

// Formato storico: solo il dump SQL. Ancora accettato in lettura/ripristino.
const legacyDumpFileNamePattern = /^db-dump-\d{8}-\d{6}\.sql$/;
// Formato attuale: archivio con il dump più le impostazioni scritte dall'app.
const archiveFileNamePattern = /^db-backup-\d{8}-\d{6}\.tar\.gz$/;

export const isBackupFileName = (fileName: string) =>
    legacyDumpFileNamePattern.test(fileName) || archiveFileNamePattern.test(fileName);

// Stessi due formati di isBackupFileName, ma senza ancoraggio: serve a estrarre i nomi
// file dall'output testuale di `smbclient ls`, non a validarne uno isolato.
export const backupFileNameScanPattern = /db-(?:backup-\d{8}-\d{6}\.tar\.gz|dump-\d{8}-\d{6}\.sql)/g;

export const isArchiveFileName = (fileName: string) => /\.tar\.gz$/i.test(fileName);

// I due formati hanno prefissi diversi ma lo stesso timestamp YYYYMMDD-HHMMSS.
// Ordinare per nome intero metterebbe tutti i "db-backup-" prima di tutti i
// "db-dump-" ('b' < 'd') a prescindere dalla data, facendo passare per piu vecchio
// l'archivio appena creato. L'ordine cronologico va preso dal timestamp.
export const getBackupSortKey = (fileName: string) => fileName.match(/(\d{8}-\d{6})/)?.[1] ?? "";

/** Dal piu vecchio al piu recente. */
export const sortBackupFileNamesByAge = (fileNames: string[]) =>
    [...fileNames].sort((a, b) => getBackupSortKey(a).localeCompare(getBackupSortKey(b)));

export const archiveDumpEntry = "dump.sql";
export const archiveDataEntry = "data";
// Elenco esplicito invece di una lista di esclusioni: un file nuovo in data/ non
// finisce nel backup per sbaglio. `secret.key` è escluso di proposito (aprirebbe i
// segreti cifrati custoditi nello stesso archivio, che finisce anche su NAS), e con
// esso `initial-admin-password.txt`, che è una credenziale in chiaro.
export const backedUpDataEntries = ["email-settings.json", "backup-settings.json", "company-settings.json", "logo"];

export const getConfiguredOutputDir = () => defaultOutputDir;

// La cartella è sempre quella montata dal compose (`backups/`, relativa alla cartella dell'app):
// il client non la sceglie, quindi non esiste un percorso assoluto da rispettare.
export const toAbsoluteOutputDir = (outputDir: string) => path.join(process.cwd(), outputDir);

const getDayTimestamp = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

export const buildArchiveFilePath = (outputDir: string, now: Date) => {
    const absoluteOutputDir = toAbsoluteOutputDir(outputDir);
    const fileName = `db-backup-${getDayTimestamp(now)}.tar.gz`;

    return path.join(absoluteOutputDir, fileName);
};

export type BackupDumpFile = {
    fileName: string;
    sizeBytes: number;
    createdAt: string;
};

export const listBackupDumps = async (): Promise<BackupDumpFile[]> => {
    const absoluteOutputDir = toAbsoluteOutputDir(getConfiguredOutputDir());

    let entries: string[];

    try {
        entries = await fs.promises.readdir(absoluteOutputDir);
    } catch {
        return [];
    }

    const dumpFiles = entries.filter(isBackupFileName);

    const stats = await Promise.all(
        dumpFiles.map(async (fileName) => {
            const stat = await fs.promises.stat(path.join(absoluteOutputDir, fileName));
            return { fileName, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
        })
    );

    // Piu recente in cima, con lo stesso criterio cronologico usato dalla retention.
    return stats.sort((a, b) => getBackupSortKey(b.fileName).localeCompare(getBackupSortKey(a.fileName)));
};

export const getBackupDumpPath = async (fileName: string) => {
    if (!isBackupFileName(fileName)) {
        throw new BackupManagerError("Nome file dump non valido", 400);
    }

    const absoluteOutputDir = toAbsoluteOutputDir(getConfiguredOutputDir());
    const filePath = path.join(absoluteOutputDir, fileName);

    try {
        await fs.promises.access(filePath);
    } catch {
        throw new BackupManagerError("File di dump non trovato", 404);
    }

    return filePath;
};

export const pruneOldBackups = async (outputDir: string, keep: number) => {
    const absoluteOutputDir = toAbsoluteOutputDir(outputDir);

    let entries: string[];

    try {
        entries = await fs.promises.readdir(absoluteOutputDir);
    } catch {
        return;
    }

    const dumpFiles = sortBackupFileNamesByAge(entries.filter(isBackupFileName));
    const filesToDelete = dumpFiles.slice(0, Math.max(0, dumpFiles.length - keep));

    await Promise.all(
        filesToDelete.map((name) => fs.promises.unlink(path.join(absoluteOutputDir, name)).catch(() => {}))
    );
};
