/**
 * Punto di ingresso del backup: lettura/scrittura delle impostazioni, esecuzione del
 * dump e scheduler automatico. I dettagli stanno nei moduli affiancati —
 * `backupFiles` (nomi e percorsi), `backupState` (impostazioni persistite),
 * `backupProcess` (pg_dump/psql/tar), `backupSmb` (copia su NAS),
 * `backupRestore` (ripristino), `backupLock` (mutua esclusione fra dump e ripristino).
 *
 * Questo file resta anche la facciata verso il resto dell'app: le rotte importano da
 * qui, non dai singoli moduli.
 */
import { BackupManagerError } from "./backupError";
import { buildArchiveFilePath, getConfiguredOutputDir, pruneOldBackups } from "./backupFiles";
import { assertNoOperationInProgress, beginDump, endDump, isDumpInProgress } from "./backupLock";
import { createBackupArchive } from "./backupProcess";
import { pruneOldSmbBackups, uploadDumpToSmb, type SmbConnectionConfig } from "./backupSmb";
import {
    loadState,
    moveNextRunToNewTimeZone,
    persistState,
    setNextRunIfNeeded,
    toPublicState,
    type BackupSettingsState,
} from "./backupState";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import { getCompanySettings } from "./companyManager";
import { isEmailConfigured, sendEmail } from "./emailManager";
import { recordNotification } from "./notificationManager";

// Riesportazioni: mantengono un unico punto di import per rotte e test, indipendente
// da come il backup è suddiviso internamente.
export { BackupManagerError } from "./backupError";
export {
    getBackupDumpPath,
    getBackupSortKey,
    listBackupDumps,
    sortBackupFileNamesByAge,
    type BackupDumpFile,
} from "./backupFiles";
export {
    composeSmbErrorMessage,
    computeSmbFilesToDelete,
    isAlreadyExistsSmbError,
    testSmbConnection,
    type SmbConnectionConfig,
} from "./backupSmb";
export { restoreBackupFromExisting, restoreBackupFromUpload } from "./backupRestore";
export { exportBackupKey } from "./backupKey";
export type { BackupSettingsPublic, BackupSettingsState } from "./backupState";

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;

export const getBackupSettings = async () => {
    const state = await loadState();
    return toPublicState(state);
};

export type BackupSettingsInput = Pick<
    BackupSettingsState,
    | "autoEnabled"
    | "frequencyDays"
    | "runAt"
    | "maxBackupsToKeep"
    | "notifyEmailOnFailure"
    | "smbEnabled"
    | "smbHost"
    | "smbShare"
    | "smbPath"
    | "smbDomain"
    | "smbPort"
    | "smbUsername"
> & { smbPassword?: string };

export const updateBackupSettings = async (input: BackupSettingsInput) => {
    const current = await loadState();
    // Un oggetto nuovo, non la cache modificata sul posto: `loadState` restituisce sempre lo
    // stesso oggetto in cache, quindi scrivere i campi direttamente su `current` (come faceva
    // prima) rendeva visibile allo scheduler un salvataggio ancora da validare, anche se le
    // verifiche qui sotto lo rifiutavano con un 400 (stesso bug corretto in
    // `updateEmailSettings` il 2026-09-18).
    const next: BackupSettingsState = {
        ...current,
        autoEnabled: input.autoEnabled,
        frequencyDays: input.frequencyDays,
        runAt: input.runAt,
        outputDir: getConfiguredOutputDir(),
        maxBackupsToKeep: input.maxBackupsToKeep,
        notifyEmailOnFailure: input.notifyEmailOnFailure,
        smbEnabled: input.smbEnabled,
        smbHost: input.smbHost.trim(),
        smbShare: input.smbShare.trim(),
        smbPath: input.smbPath.trim(),
        smbDomain: input.smbDomain.trim(),
        smbPort: input.smbPort,
        smbUsername: input.smbUsername.trim(),
        smbPasswordEncrypted: input.smbPassword ? await encryptSecret(input.smbPassword) : current.smbPasswordEncrypted,
    };

    if (next.smbEnabled && (!next.smbHost || !next.smbShare || !next.smbUsername)) {
        throw new BackupManagerError("Per abilitare la destinazione NAS specifica host, condivisione e utente", 400);
    }

    if (next.smbEnabled && !next.smbPasswordEncrypted) {
        throw new BackupManagerError("Specifica una password per la connessione al NAS", 400);
    }

    if (next.notifyEmailOnFailure && !(await isEmailConfigured())) {
        throw new BackupManagerError(
            "Per abilitare l'avviso email configura prima l'invio email nelle impostazioni",
            400
        );
    }

    setNextRunIfNeeded(next, new Date());
    await persistState(next);

    return await toPublicState(next);
};

/** Da chiamare dopo un cambio del fuso del laboratorio: vedi `moveNextRunToNewTimeZone`. */
export const refreshBackupSchedule = async (previousTimeZone: string) => {
    const state = await loadState();
    moveNextRunToNewTimeZone(state, previousTimeZone, new Date());
    await persistState(state);
};

// L'invio non deve mai far fallire il backup: se non riesce (SMTP giù, credenziali
// scadute...) l'errore resta solo nei log, la notifica in app è già stata registrata.
const sendBackupFailureEmail = async (title: string, message: string) => {
    try {
        if (!(await isEmailConfigured())) {
            return;
        }

        const company = await getCompanySettings();

        if (!company.email) {
            return;
        }

        await sendEmail({
            to: company.email,
            subject: `${title} - ${company.name}`,
            text: `${title}\n\n${message}`,
        });
    } catch (error) {
        console.error("Invio email di avviso backup non riuscito:", error);
    }
};

// Un'esecuzione manuale ha gia' mostrato l'errore a chi l'ha lanciata; quella automatica
// gira di notte e senza notifica non la vedrebbe nessuno.
const notifyAutoBackupFailure = async (
    origin: "manual" | "auto",
    dedupeKey: string,
    title: string,
    message: string,
    notifyEmailOnFailure: boolean
) => {
    if (origin !== "auto") {
        return;
    }

    await recordNotification({
        dedupeKey,
        title,
        message,
        link: "/settings?section=backup",
        severity: "warning",
    });

    // Volutamente senza await: questa funzione gira dentro il blocco try/finally che tiene il
    // lock del dump (vedi `runBackupNow`), e l'invio SMTP può metterci diversi secondi. Aspettarlo
    // qui significava tenere il lock — quindi bloccare qualunque altro dump o ripristino — per
    // tutta la sua durata. `sendBackupFailureEmail` ha già il proprio try/catch, quindi un
    // eventuale errore non genera una promise rifiutata senza gestore.
    if (notifyEmailOnFailure) {
        void sendBackupFailureEmail(title, message);
    }
};

export const runBackupNow = async (origin: "manual" | "auto") => {
    const state = await loadState();

    if (origin === "auto" && !state.autoEnabled) {
        throw new BackupManagerError("Il dump automatico non e abilitato nelle impostazioni", 400);
    }

    assertNoOperationInProgress();

    beginDump();
    const now = new Date();

    try {
        const outputPath = buildArchiveFilePath(getConfiguredOutputDir(), now);
        await createBackupArchive(outputPath);
        await pruneOldBackups(getConfiguredOutputDir(), state.maxBackupsToKeep);

        state.lastRunAt = now.toISOString();
        state.lastRunStatus = "success";
        state.lastRunOrigin = origin;
        state.lastError = null;
        state.lastDumpPath = outputPath;

        let message = origin === "manual" ? "Dump completato con successo" : "Dump automatico completato";

        if (state.smbEnabled && state.smbPasswordEncrypted) {
            try {
                const smbConfig: SmbConnectionConfig = {
                    host: state.smbHost,
                    share: state.smbShare,
                    path: state.smbPath,
                    domain: state.smbDomain,
                    port: state.smbPort,
                    username: state.smbUsername,
                    password: await decryptSecret(state.smbPasswordEncrypted),
                };

                await uploadDumpToSmb(smbConfig, outputPath);

                state.smbLastRunAt = now.toISOString();
                state.smbLastStatus = "success";
                state.smbLastError = null;

                try {
                    await pruneOldSmbBackups(smbConfig, state.maxBackupsToKeep);
                } catch (pruneError) {
                    const pruneMessage =
                        pruneError instanceof Error
                            ? pruneError.message
                            : "Errore durante la pulizia dei backup sul NAS";
                    message = `${message}, ma la pulizia dei vecchi backup sul NAS non e riuscita: ${pruneMessage}`;

                    await notifyAutoBackupFailure(
                        origin,
                        "backup:auto-nas-prune-failed",
                        "Pulizia dei vecchi backup sul NAS non riuscita",
                        pruneMessage,
                        state.notifyEmailOnFailure
                    );
                }
            } catch (smbError) {
                const smbMessage = smbError instanceof Error ? smbError.message : "Errore durante la copia su NAS";
                state.smbLastRunAt = now.toISOString();
                state.smbLastStatus = "failed";
                state.smbLastError = smbMessage;
                message = `${message}, ma la copia su NAS non e riuscita: ${smbMessage}`;

                await notifyAutoBackupFailure(
                    origin,
                    "backup:auto-nas-failed",
                    "Copia del backup su NAS non riuscita",
                    smbMessage,
                    state.notifyEmailOnFailure
                );
            }
        }

        setNextRunIfNeeded(state, now);
        await persistState(state);

        return {
            ...(await toPublicState(state)),
            message,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Errore durante il dump database";
        state.lastRunAt = now.toISOString();
        state.lastRunStatus = "failed";
        state.lastRunOrigin = origin;
        state.lastError = message;
        setNextRunIfNeeded(state, now);
        await persistState(state);

        await notifyAutoBackupFailure(
            origin,
            "backup:auto-failed",
            "Backup automatico non riuscito",
            message,
            state.notifyEmailOnFailure
        );

        throw error;
    } finally {
        endDump();
    }
};

export const startBackupScheduler = () => {
    if (schedulerStarted) {
        return;
    }

    schedulerStarted = true;

    schedulerTimer = setInterval(() => {
        void (async () => {
            if (isDumpInProgress()) {
                return;
            }

            try {
                const state = await loadState();

                if (!state.autoEnabled || !state.nextRunAt) {
                    return;
                }

                const now = new Date();
                const nextRunAt = new Date(state.nextRunAt);

                if (Number.isNaN(nextRunAt.getTime()) || now.getTime() < nextRunAt.getTime()) {
                    return;
                }

                await runBackupNow("auto");
            } catch (error) {
                console.error("Errore scheduler dump database:", error);
            }
        })();
    }, 60 * 1000);

    schedulerTimer.unref();
};

export const stopBackupScheduler = () => {
    if (!schedulerTimer) {
        return;
    }

    clearInterval(schedulerTimer);
    schedulerTimer = null;
    schedulerStarted = false;
};
