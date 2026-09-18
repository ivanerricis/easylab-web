/**
 * Impostazioni del backup: forma dello stato persistito in data/backup-settings.json,
 * validazione in lettura, cache in memoria e proiezione verso il frontend.
 */
import { BackupManagerError } from "./backupError";
import {
    backupSettingsFileName,
    defaultMaxBackupsToKeep,
    defaultOutputDir,
    getConfiguredOutputDir,
} from "./backupFiles";
import { createJsonSettingsStore } from "./jsonSettingsStore";
import { defaultSmbPort } from "./backupSmb";
import { decryptSecret } from "./secretCrypto";
import { isEmailConfigured, isStoredEmailPasswordUsable } from "./emailManager";

export type BackupSettingsState = {
    autoEnabled: boolean;
    frequencyDays: number;
    runAt: string;
    outputDir: string;
    maxBackupsToKeep: number;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastRunStatus: "idle" | "success" | "failed";
    /** Chi ha avviato l'ultima esecuzione: serve ad avvisare solo sui fallimenti non presidiati. */
    lastRunOrigin: "manual" | "auto" | null;
    lastError: string | null;
    lastDumpPath: string | null;
    /** Avvisa via email (oltre alla notifica in app) quando un backup automatico fallisce. */
    notifyEmailOnFailure: boolean;
    smbEnabled: boolean;
    smbHost: string;
    smbShare: string;
    smbPath: string;
    smbDomain: string;
    smbPort: number;
    smbUsername: string;
    smbPasswordEncrypted: string | null;
    smbLastRunAt: string | null;
    smbLastStatus: "idle" | "success" | "failed";
    smbLastError: string | null;
    lastRestoreAt: string | null;
    lastRestoreStatus: "idle" | "success" | "failed";
    lastRestoreError: string | null;
    lastRestoreFileName: string | null;
};

export const defaultState: BackupSettingsState = {
    autoEnabled: false,
    frequencyDays: 1,
    runAt: "02:00",
    outputDir: defaultOutputDir,
    maxBackupsToKeep: defaultMaxBackupsToKeep,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: "idle",
    lastRunOrigin: null,
    lastError: null,
    lastDumpPath: null,
    notifyEmailOnFailure: false,
    smbEnabled: false,
    smbHost: "",
    smbShare: "",
    smbPath: "",
    smbDomain: "",
    smbPort: defaultSmbPort,
    smbUsername: "",
    smbPasswordEncrypted: null,
    smbLastRunAt: null,
    smbLastStatus: "idle",
    smbLastError: null,
    lastRestoreAt: null,
    lastRestoreStatus: "idle",
    lastRestoreError: null,
    lastRestoreFileName: null,
};

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseRunTime = (runAt: string) => {
    const match = runAt.match(timePattern);

    if (!match) {
        throw new BackupManagerError("Formato orario non valido. Usa HH:mm", 400);
    }

    return {
        hours: Number(match[1]),
        minutes: Number(match[2]),
    };
};

const computeNextRunAt = (referenceDate: Date, frequencyDays: number, runAt: string) => {
    const { hours, minutes } = parseRunTime(runAt);
    const candidate = new Date(referenceDate);
    candidate.setSeconds(0, 0);
    candidate.setHours(hours, minutes, 0, 0);

    if (candidate.getTime() <= referenceDate.getTime()) {
        candidate.setDate(candidate.getDate() + frequencyDays);
    }

    return candidate.toISOString();
};

/**
 * Dopo un cambio di fuso: il prossimo backup tiene il giorno che aveva nel fuso precedente e
 * passa all'orario impostato nel nuovo. Ricalcolarlo da "adesso" avrebbe spostato anche il
 * giorno, e con una frequenza di più giorni saltato un backup. Se quell'istante è già passato si
 * riparte dal calcolo normale. Va chiamata con il processo già nel fuso nuovo (`TZ`), perché
 * l'orario si compone con l'ora locale di `Date`, come in `computeNextRunAt`.
 */
export const moveNextRunToNewTimeZone = (state: BackupSettingsState, previousTimeZone: string, now: Date) => {
    if (!state.autoEnabled || !state.nextRunAt) {
        setNextRunIfNeeded(state, now);
        return;
    }

    const previousNextRun = new Date(state.nextRunAt);

    if (Number.isNaN(previousNextRun.getTime())) {
        setNextRunIfNeeded(state, now);
        return;
    }

    // "en-CA" scrive le date come YYYY-MM-DD.
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
        timeZone: previousTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    })
        .format(previousNextRun)
        .split("-")
        .map(Number);
    const { hours, minutes } = parseRunTime(state.runAt);
    const candidate = new Date(year, month - 1, day, hours, minutes, 0, 0);

    if (candidate.getTime() <= now.getTime()) {
        setNextRunIfNeeded(state, now);
        return;
    }

    state.nextRunAt = candidate.toISOString();
};

export const setNextRunIfNeeded = (state: BackupSettingsState, reference: Date) => {
    if (state.autoEnabled) {
        state.nextRunAt = computeNextRunAt(reference, state.frequencyDays, state.runAt);
        return;
    }

    state.nextRunAt = null;
};

export const sanitizeState = (input: Partial<BackupSettingsState>): BackupSettingsState => {
    const frequencyDays = Number(input.frequencyDays ?? defaultState.frequencyDays);
    const runAt = typeof input.runAt === "string" ? input.runAt : defaultState.runAt;
    const maxBackupsToKeep = Number(input.maxBackupsToKeep ?? defaultState.maxBackupsToKeep);
    const smbPort = Number(input.smbPort ?? defaultState.smbPort);

    if (!Number.isInteger(frequencyDays) || frequencyDays <= 0 || frequencyDays > 365) {
        throw new BackupManagerError("La frequenza deve essere tra 1 e 365 giorni", 400);
    }

    if (!Number.isInteger(maxBackupsToKeep) || maxBackupsToKeep <= 0 || maxBackupsToKeep > 365) {
        throw new BackupManagerError("Il numero di backup da mantenere deve essere tra 1 e 365", 400);
    }

    if (!Number.isInteger(smbPort) || smbPort <= 0 || smbPort > 65535) {
        throw new BackupManagerError("La porta SMB deve essere un numero valido", 400);
    }

    parseRunTime(runAt);

    return {
        autoEnabled: Boolean(input.autoEnabled ?? defaultState.autoEnabled),
        frequencyDays,
        runAt,
        outputDir: getConfiguredOutputDir(),
        maxBackupsToKeep,
        nextRunAt: typeof input.nextRunAt === "string" ? input.nextRunAt : null,
        lastRunAt: typeof input.lastRunAt === "string" ? input.lastRunAt : null,
        lastRunStatus:
            input.lastRunStatus === "success" || input.lastRunStatus === "failed" || input.lastRunStatus === "idle"
                ? input.lastRunStatus
                : defaultState.lastRunStatus,
        lastRunOrigin: input.lastRunOrigin === "manual" || input.lastRunOrigin === "auto" ? input.lastRunOrigin : null,
        lastError: typeof input.lastError === "string" ? input.lastError : null,
        lastDumpPath: typeof input.lastDumpPath === "string" ? input.lastDumpPath : null,
        notifyEmailOnFailure: Boolean(input.notifyEmailOnFailure ?? defaultState.notifyEmailOnFailure),
        smbEnabled: Boolean(input.smbEnabled ?? defaultState.smbEnabled),
        smbHost: typeof input.smbHost === "string" ? input.smbHost.trim() : defaultState.smbHost,
        smbShare: typeof input.smbShare === "string" ? input.smbShare.trim() : defaultState.smbShare,
        smbPath: typeof input.smbPath === "string" ? input.smbPath.trim() : defaultState.smbPath,
        smbDomain: typeof input.smbDomain === "string" ? input.smbDomain.trim() : defaultState.smbDomain,
        smbPort,
        smbUsername: typeof input.smbUsername === "string" ? input.smbUsername.trim() : defaultState.smbUsername,
        smbPasswordEncrypted: typeof input.smbPasswordEncrypted === "string" ? input.smbPasswordEncrypted : null,
        smbLastRunAt: typeof input.smbLastRunAt === "string" ? input.smbLastRunAt : null,
        smbLastStatus:
            input.smbLastStatus === "success" || input.smbLastStatus === "failed" || input.smbLastStatus === "idle"
                ? input.smbLastStatus
                : defaultState.smbLastStatus,
        smbLastError: typeof input.smbLastError === "string" ? input.smbLastError : null,
        lastRestoreAt: typeof input.lastRestoreAt === "string" ? input.lastRestoreAt : null,
        lastRestoreStatus:
            input.lastRestoreStatus === "success" ||
            input.lastRestoreStatus === "failed" ||
            input.lastRestoreStatus === "idle"
                ? input.lastRestoreStatus
                : defaultState.lastRestoreStatus,
        lastRestoreError: typeof input.lastRestoreError === "string" ? input.lastRestoreError : null,
        lastRestoreFileName: typeof input.lastRestoreFileName === "string" ? input.lastRestoreFileName : null,
    };
};

// Chi chiama modifica lo stato caricato sul posto e poi lo salva: `load` restituisce sempre lo
// stesso oggetto della cache, quindi le modifiche restano visibili anche prima del salvataggio.
const store = createJsonSettingsStore({
    fileName: backupSettingsFileName,
    defaults: defaultState,
    sanitize: sanitizeState,
});

export const persistState = store.save;

export const loadState = store.load;

/** Da chiamare quando backup-settings.json è cambiato sotto la cache (es. dopo un ripristino). */
export const invalidateBackupStateCache = store.invalidate;

// I segreti sono cifrati con data/secret.key, esclusa dai backup di proposito. Su una
// macchina con chiave diversa restano illeggibili: va detto subito e per iscritto,
// invece di lasciarlo scoprire al primo invio email o al primo upload su NAS.
export const findSecretsToReconfigure = async (state: BackupSettingsState) => {
    const toReconfigure: string[] = [];

    if (!(await isStoredEmailPasswordUsable())) {
        toReconfigure.push("Password email (SMTP)");
    }

    if (state.smbPasswordEncrypted) {
        try {
            await decryptSecret(state.smbPasswordEncrypted);
        } catch {
            toReconfigure.push("Password NAS (SMB)");
        }
    }

    return toReconfigure;
};

export type BackupSettingsPublic = Omit<BackupSettingsState, "smbPasswordEncrypted"> & {
    smbPasswordSet: boolean;
    /** Segreti che con la chiave presente non sono leggibili e vanno reinseriti. */
    restoreSecretsToReconfigure: string[];
    /** Determina se la checkbox di avviso email può essere attivata dal frontend. */
    emailConfigured: boolean;
};

// Calcolato a ogni lettura invece di essere persistito: così l'avviso sparisce da
// solo appena la password viene reinserita, senza doverlo azzerare esplicitamente
// da ogni punto che salva le impostazioni.
export const toPublicState = async (state: BackupSettingsState): Promise<BackupSettingsPublic> => {
    const { smbPasswordEncrypted, ...rest } = state;

    return {
        ...rest,
        smbPasswordSet: Boolean(smbPasswordEncrypted),
        restoreSecretsToReconfigure: await findSecretsToReconfigure(state),
        emailConfigured: await isEmailConfigured(),
    };
};
