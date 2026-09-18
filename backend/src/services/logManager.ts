import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./apiError";
import { createJsonSettingsStore } from "./jsonSettingsStore";

const logDir = path.join(process.cwd(), "logs");
const logFilePrefix = "user-actions-";
const logFileExtension = ".log";
const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const dailyLogFileNamePattern = /^user-actions-\d{4}-\d{2}-\d{2}\.log$/;
let lastCleanupDay = "";

const minRetentionDays = 1;
const maxRetentionDays = 90;

export type LogRetentionState = { maxDays: number };

const defaultRetention: LogRetentionState = { maxDays: 7 };

const sanitizeRetention = (input: Partial<LogRetentionState>): LogRetentionState => {
    const maxDays = Number(input.maxDays);

    return {
        maxDays:
            Number.isInteger(maxDays) && maxDays >= minRetentionDays && maxDays <= maxRetentionDays
                ? maxDays
                : defaultRetention.maxDays,
    };
};

// A differenza delle altre impostazioni persistite (company/backup), qui un file mancante non
// viene scritto: il default vale finché nessuno lo cambia davvero, invece di aggiungere una
// scrittura alla prima riga di log del giorno.
const retentionStore = createJsonSettingsStore({
    fileName: "log-settings.json",
    defaults: defaultRetention,
    sanitize: sanitizeRetention,
    persistDefaults: false,
});

export const getLogRetentionDays = async (): Promise<number> => (await retentionStore.load()).maxDays;

export const setLogRetentionDays = async (maxDays: number): Promise<LogRetentionState> => {
    if (!Number.isInteger(maxDays) || maxDays < minRetentionDays || maxDays > maxRetentionDays) {
        throw new LogManagerError(
            `La conservazione dei log deve essere tra ${minRetentionDays} e ${maxRetentionDays} giorni`,
            400
        );
    }

    const next = { maxDays };
    await retentionStore.save(next);

    return next;
};

export class LogManagerError extends ApiError {}

export type LogEntry = {
    timestamp: string;
    ip: string;
    user: string;
    action: string;
    status: number;
    error: string | null;
};

export type LogFileSummary = {
    dayKey: string;
    sizeBytes: number;
    updatedAt: string;
};

export const getDayKey = (date: Date) => date.toISOString().slice(0, 10);

const getDailyLogFilePath = (dayKey: string) => path.join(logDir, `${logFilePrefix}${dayKey}${logFileExtension}`);

const extractDayKey = (fileName: string) => fileName.slice(logFilePrefix.length, logFilePrefix.length + 10);

const cleanupOldDailyLogs = async () => {
    const maxLogFiles = await getLogRetentionDays();
    const dirEntries = await fs.promises.readdir(logDir, { withFileTypes: true });
    const logFiles = dirEntries
        .filter((entry) => entry.isFile() && dailyLogFileNamePattern.test(entry.name))
        .map((entry) => entry.name)
        .sort();

    if (logFiles.length <= maxLogFiles) {
        return;
    }

    const filesToDelete = logFiles.slice(0, logFiles.length - maxLogFiles);
    await Promise.all(filesToDelete.map((fileName) => fs.promises.unlink(path.join(logDir, fileName))));
};

export const appendUserActionLog = async (logLine: string, dayKey: string) => {
    await fs.promises.mkdir(logDir, { recursive: true });
    await fs.promises.appendFile(getDailyLogFilePath(dayKey), logLine);

    if (lastCleanupDay !== dayKey) {
        await cleanupOldDailyLogs();
        lastCleanupDay = dayKey;
    }
};

export const listLogFiles = async (): Promise<LogFileSummary[]> => {
    let dirEntries: fs.Dirent[];

    try {
        dirEntries = await fs.promises.readdir(logDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const logFileNames = dirEntries
        .filter((entry) => entry.isFile() && dailyLogFileNamePattern.test(entry.name))
        .map((entry) => entry.name);

    const summaries = await Promise.all(
        logFileNames.map(async (fileName) => {
            const stat = await fs.promises.stat(path.join(logDir, fileName));
            return {
                dayKey: extractDayKey(fileName),
                sizeBytes: stat.size,
                updatedAt: stat.mtime.toISOString(),
            };
        })
    );

    return summaries.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
};

// Il campo "user=" e' opzionale nel pattern per restare compatibile con le righe di log
// scritte prima che il tracciamento dell'utente fosse introdotto.
const logLinePattern = /^(\S+) \| ip=(\S+) \|(?: user=(.+?) \|)? action=(.+?) \| status=(\d+)(?: \| error=(.*))?$/;

const parseLogLine = (line: string): LogEntry | null => {
    const match = logLinePattern.exec(line);

    if (!match) {
        return null;
    }

    const [, timestamp, ip, user, action, status, error] = match;

    return {
        timestamp,
        ip,
        user: user ?? "-",
        action,
        status: Number(status),
        error: error ?? null,
    };
};

export const getLogFilePath = (dayKey: string) => {
    if (!dayKeyPattern.test(dayKey)) {
        throw new LogManagerError("Data non valida", 400);
    }

    return getDailyLogFilePath(dayKey);
};

// Le uniche due azioni scritte da userActionLogger per un tentativo di accesso (vedi
// actionLabelRules lì): un fallimento su una qualunque delle due è un accesso respinto,
// che sia una password sbagliata o un secondo fattore sbagliato.
const loginAttemptActions = new Set(["tentativo di accesso", "verifica codice 2FA in accesso"]);

/**
 * Gli ultimi tentativi di accesso falliti, dal giorno più recente a ritroso finché non se
 * ne trovano `limit` o finiscono i log conservati. Attraversa i file uno alla volta invece
 * di caricarli tutti insieme: di norma bastano gli ultimi uno o due giorni.
 */
export const listRecentFailedLogins = async (limit = 20): Promise<LogEntry[]> => {
    const files = await listLogFiles();
    const results: LogEntry[] = [];

    for (const file of files) {
        if (results.length >= limit) {
            break;
        }

        let entries: LogEntry[];

        try {
            entries = await readLogEntries(file.dayKey);
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (results.length >= limit) {
                break;
            }

            if (entry.status >= 400 && loginAttemptActions.has(entry.action)) {
                results.push(entry);
            }
        }
    }

    return results;
};

export const readLogEntries = async (dayKey: string): Promise<LogEntry[]> => {
    const filePath = getLogFilePath(dayKey);

    let content: string;

    try {
        content = await fs.promises.readFile(filePath, "utf-8");
    } catch {
        throw new LogManagerError("Nessun log trovato per la data richiesta", 404);
    }

    return content
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map(parseLogLine)
        .filter((entry): entry is LogEntry => entry !== null)
        .reverse();
};
