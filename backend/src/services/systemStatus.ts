import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { sendAlertEmail } from "./alertEmail";
import { getConfiguredOutputDir, toAbsoluteOutputDir } from "./backupFiles";
import { getCompanySettings } from "./companyManager";
import { recordNotification } from "./notificationManager";

// Due soglie, basta una per far scattare l'avviso: la percentuale protegge i dischi grandi,
// dove il 10% sono decine di GB e l'avviso arriva con largo anticipo; i 2 GiB servono sui
// dischi piccoli, perché un dump e il suo archivio devono ancora starci.
const lowFreeSpaceRatio = 0.1;
const lowFreeSpaceBytes = 2 * 1024 ** 3;

const monitorIntervalMs = 60 * 60 * 1000;
// Il primo controllo non aspetta un'ora intera, ma nemmeno parte nel pieno dell'avvio.
const firstCheckDelayMs = 60 * 1000;

const dataDirLabel = "Disco del server";
const backupsDirLabel = "Cartella dei backup";
const sharedDiskLabel = "Disco del server (dati e backup)";

type DiskStatus = {
    key: "data" | "backups";
    label: string;
    totalBytes: number;
    /**
     * Occupato come lo contano `df` e Proxmox: totale meno blocchi liberi, compresi quelli che
     * ext4 riserva a root (il 5%). È il numero da mostrare, per ritrovarlo uguale altrove.
     */
    usedBytes: number;
    /** Libero per chi non è root, cioè per Postgres e per il backend: su questo si decide `low`. */
    freeBytes: number;
    low: boolean;
};

type SystemStatus = {
    disks: DiskStatus[];
    databaseSizeBytes: number | null;
    checkedAt: string;
};

const units = ["byte", "KB", "MB", "GB", "TB"];

// Base 1024 e una cifra decimale con la virgola ("1,2 GB", "850 MB"), come si legge in Italia.
const formatBytes = (bytes: number): string => {
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    const text = unit === 0 || value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(".", ",");

    return `${text} ${units[unit]}`;
};

type DiskReading = DiskStatus & { dev: number };

const readDisk = async (key: DiskStatus["key"], label: string, folder: string): Promise<DiskReading | null> => {
    try {
        const [stats, fsStats] = await Promise.all([fs.promises.stat(folder), fs.promises.statfs(folder)]);
        const totalBytes = Number(fsStats.blocks) * Number(fsStats.bsize);
        const freeBytes = Number(fsStats.bavail) * Number(fsStats.bsize);
        const usedBytes = totalBytes - Number(fsStats.bfree) * Number(fsStats.bsize);

        // Un filesystem virtuale può dichiarare zero blocchi: niente da mostrare, e la
        // percentuale dell'avviso verrebbe NaN.
        if (totalBytes <= 0) {
            return null;
        }

        return {
            key,
            label,
            totalBytes,
            usedBytes,
            freeBytes,
            low: freeBytes < totalBytes * lowFreeSpaceRatio || freeBytes < lowFreeSpaceBytes,
            dev: stats.dev,
        };
    } catch (error) {
        // Una cartella che manca (backup mai eseguiti, volume non montato) non deve togliere
        // all'amministratore le informazioni sull'altra.
        console.warn(`Lettura dello spazio su disco di ${folder} non riuscita:`, error);
        return null;
    }
};

const getDisks = async (): Promise<DiskStatus[]> => {
    const readings = [
        await readDisk("data", dataDirLabel, path.join(process.cwd(), "data")),
        await readDisk("backups", backupsDirLabel, toAbsoluteOutputDir(getConfiguredOutputDir())),
    ].filter((reading): reading is DiskReading => reading !== null);

    // In produzione dati e backup stanno spesso su filesystem diversi (volume Docker e bind
    // mount), ma non sempre: mostrare lo stesso disco due volte lo farebbe contare due volte.
    const [first, second] = readings;
    const merged = first && second && first.dev === second.dev ? [{ ...first, label: sharedDiskLabel }] : readings;

    return merged.map(({ dev: _dev, ...disk }) => disk);
};

const getDatabaseSizeBytes = async (): Promise<number | null> => {
    try {
        const result = await db.execute(sql`select pg_database_size(current_database()) as size`);
        // Postgres restituisce i bigint come stringa.
        const size = Number((result.rows[0] as { size: string | number } | undefined)?.size);

        return Number.isFinite(size) ? size : null;
    } catch (error) {
        console.error("Lettura della dimensione del database non riuscita:", error);
        return null;
    }
};

export const getSystemStatus = async (): Promise<SystemStatus> => ({
    disks: await getDisks(),
    databaseSizeBytes: await getDatabaseSizeBytes(),
    checkedAt: new Date().toISOString(),
});

// Chiavi dei dischi già segnalati come bassi. Si avvisa solo nel passaggio da ok a basso:
// `upsertNotification` azzera `dismissedAt` a ogni chiamata, quindi ripetere l'avviso ogni ora
// riaprirebbe la notifica chiusa dall'amministratore e manderebbe un'email all'ora.
// Sta in memoria: dopo un riavvio, se lo spazio è ancora poco, ricordarlo una volta è giusto.
const reportedLowDisks = new Set<DiskStatus["key"]>();

export const resetDiskSpaceAlerts = () => {
    reportedLowDisks.clear();
};

const alertLowDisk = async (disk: DiskStatus) => {
    // Gli stessi numeri della sezione Sistema e di Proxmox: chi riceve l'avviso li ritrova uguali.
    const percent = Math.round((disk.usedBytes / disk.totalBytes) * 100);
    const message = `${disk.label}: usati ${formatBytes(disk.usedBytes)} su ${formatBytes(disk.totalBytes)} (${percent}%).`;
    const title = "Spazio su disco in esaurimento";

    await recordNotification({
        dedupeKey: `low-disk-space:${disk.key}`,
        severity: "warning",
        title,
        message,
        link: "/settings?section=system",
    });

    const company = await getCompanySettings();

    // Volutamente senza await: il controllo non aspetta l'SMTP. L'errore resta solo nei log,
    // come per le altre email di avviso.
    void sendAlertEmail({
        subject: `${title} - ${company.name}`,
        text: `${title}\n\n${message}\nLibera spazio o sposta i backup: lo stato è in Impostazioni → Sistema.`,
    }).catch((error: unknown) => {
        console.error("Invio email di avviso spazio su disco non riuscito:", error);
    });
};

export const checkDiskSpace = async (): Promise<void> => {
    try {
        for (const disk of await getDisks()) {
            if (!disk.low) {
                reportedLowDisks.delete(disk.key);
                continue;
            }

            if (reportedLowDisks.has(disk.key)) {
                continue;
            }

            reportedLowDisks.add(disk.key);
            await alertLowDisk(disk);
        }
    } catch (error) {
        // Un timer che lancia abbatterebbe il processo: qui un errore vale solo un log.
        console.error("Controllo dello spazio su disco non riuscito:", error);
    }
};

let monitorStarted = false;
let monitorTimer: NodeJS.Timeout | null = null;
let firstCheckTimer: NodeJS.Timeout | null = null;

export const startDiskSpaceMonitor = () => {
    if (monitorStarted) {
        return;
    }

    monitorStarted = true;

    firstCheckTimer = setTimeout(() => {
        firstCheckTimer = null;
        void checkDiskSpace();
    }, firstCheckDelayMs);
    firstCheckTimer.unref();

    monitorTimer = setInterval(() => {
        void checkDiskSpace();
    }, monitorIntervalMs);
    monitorTimer.unref();
};

export const stopDiskSpaceMonitor = () => {
    if (firstCheckTimer) {
        clearTimeout(firstCheckTimer);
        firstCheckTimer = null;
    }

    if (monitorTimer) {
        clearInterval(monitorTimer);
        monitorTimer = null;
    }

    monitorStarted = false;
};
