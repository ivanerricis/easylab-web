import { startTransition, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/components/use-auth";
import { useBusyGuard } from "@/components/use-busy-guard";
import type { SettingsRunStatus } from "@/components/settings/settingsUi";
import {
    getApiErrorMessage,
    getBackupDumpDownloadUrl,
    getBackupKey,
    getBackupSettings,
    listBackupDumps,
    restoreBackupFromExisting,
    restoreBackupFromUpload,
    runBackupNow,
    testSmbConnection,
    updateBackupSettings,
    type BackupDumpFileDto,
    type BackupSettingsInput,
} from "@/lib/api";
import { isSettingsFormDirty } from "@/lib/settingsForm";

export const restoreConfirmKeyword = "RESTORE";

export type PendingRestore = { type: "existing"; fileName: string } | { type: "upload"; file: File };

const defaultForm: BackupSettingsInput = {
    autoEnabled: false,
    frequencyDays: 1,
    runAt: "02:00",
    outputDir: "backups",
    maxBackupsToKeep: 14,
    notifyEmailOnFailure: false,
    smbEnabled: false,
    smbHost: "",
    smbShare: "",
    smbPath: "",
    smbDomain: "",
    smbPort: 445,
    smbUsername: "",
    smbPassword: "",
};

/**
 * Tutto lo stato e le azioni del pannello backup. Sta in un hook separato dalle schede
 * che lo mostrano perché il pannello ha una ventina di variabili di stato condivise fra
 * schede diverse: passarle come prop una per una renderebbe illeggibili le firme, e
 * duplicarle per scheda le disallineerebbe (lo stesso `lastRunStatus` è aggiornato sia
 * dal salvataggio sia dall'esecuzione del dump).
 */
export const useBackupPanel = () => {
    const { setBusy } = useBusyGuard();
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRunningBackup, setIsRunningBackup] = useState(false);
    const [formValues, setFormValues] = useState<BackupSettingsInput>(defaultForm);
    const [savedValues, setSavedValues] = useState<BackupSettingsInput>(defaultForm);
    const [lastRunAt, setLastRunAt] = useState<string | null>(null);
    const [lastRunStatus, setLastRunStatus] = useState<SettingsRunStatus>("idle");
    const [lastError, setLastError] = useState<string | null>(null);
    const [nextRunAt, setNextRunAt] = useState<string | null>(null);
    const [lastDumpPath, setLastDumpPath] = useState<string | null>(null);
    const [emailConfigured, setEmailConfigured] = useState(false);
    const [dumpFiles, setDumpFiles] = useState<BackupDumpFileDto[]>([]);
    const [isLoadingDumps, setIsLoadingDumps] = useState(false);
    const [smbPasswordSet, setSmbPasswordSet] = useState(false);
    const [smbLastRunAt, setSmbLastRunAt] = useState<string | null>(null);
    const [smbLastStatus, setSmbLastStatus] = useState<SettingsRunStatus>("idle");
    const [smbLastError, setSmbLastError] = useState<string | null>(null);
    const [isTestingSmb, setIsTestingSmb] = useState(false);

    const [restoreUploadFile, setRestoreUploadFile] = useState<File | null>(null);
    const [resetSchemaOnRestore, setResetSchemaOnRestore] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
    const [restoreConfirmText, setRestoreConfirmText] = useState("");
    const [lastRestoreAt, setLastRestoreAt] = useState<string | null>(null);
    const [lastRestoreStatus, setLastRestoreStatus] = useState<SettingsRunStatus>("idle");
    const [lastRestoreError, setLastRestoreError] = useState<string | null>(null);
    const [lastRestoreFileName, setLastRestoreFileName] = useState<string | null>(null);
    const [secretsToReconfigure, setSecretsToReconfigure] = useState<string[]>([]);
    const [restoreBackupKeyInput, setRestoreBackupKeyInput] = useState("");
    const [backupKey, setBackupKey] = useState<string | null>(null);
    const [isLoadingBackupKey, setIsLoadingBackupKey] = useState(false);

    const isDirty = isSettingsFormDirty(formValues, savedValues, ["smbPassword"]);

    const loadSettings = async () => {
        setIsLoading(true);

        try {
            const settings = await getBackupSettings();
            const nextValues: BackupSettingsInput = {
                autoEnabled: settings.autoEnabled,
                frequencyDays: settings.frequencyDays,
                runAt: settings.runAt,
                outputDir: settings.outputDir,
                maxBackupsToKeep: settings.maxBackupsToKeep,
                notifyEmailOnFailure: settings.notifyEmailOnFailure,
                smbEnabled: settings.smbEnabled,
                smbHost: settings.smbHost,
                smbShare: settings.smbShare,
                smbPath: settings.smbPath,
                smbDomain: settings.smbDomain,
                smbPort: settings.smbPort,
                smbUsername: settings.smbUsername,
                smbPassword: "",
            };
            setFormValues(nextValues);
            setSavedValues(nextValues);
            setLastRunAt(settings.lastRunAt);
            setLastRunStatus(settings.lastRunStatus);
            setLastError(settings.lastError);
            setNextRunAt(settings.nextRunAt);
            setLastDumpPath(settings.lastDumpPath);
            setEmailConfigured(settings.emailConfigured);
            setSmbPasswordSet(settings.smbPasswordSet);
            setSmbLastRunAt(settings.smbLastRunAt);
            setSmbLastStatus(settings.smbLastStatus);
            setSmbLastError(settings.smbLastError);
            setLastRestoreAt(settings.lastRestoreAt);
            setLastRestoreStatus(settings.lastRestoreStatus);
            setLastRestoreError(settings.lastRestoreError);
            setLastRestoreFileName(settings.lastRestoreFileName);
            setSecretsToReconfigure(settings.restoreSecretsToReconfigure);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare le impostazioni backup"));
        } finally {
            setIsLoading(false);
        }
    };

    const loadDumpFiles = async () => {
        setIsLoadingDumps(true);

        try {
            setDumpFiles(await listBackupDumps());
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare l'elenco dei dump"));
        } finally {
            setIsLoadingDumps(false);
        }
    };

    // Caricamento iniziale: gira una volta sola al montaggio del pannello.
    useEffect(() => {
        startTransition(() => {
            void loadSettings();
            void loadDumpFiles();
        });
    }, []);

    const handleSave = async () => {
        if (isSaving || isLoading) {
            return;
        }

        if (!Number.isInteger(formValues.frequencyDays) || formValues.frequencyDays <= 0) {
            toast.error("La frequenza deve essere un numero intero positivo");
            return;
        }

        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(formValues.runAt)) {
            toast.error("L'orario deve essere nel formato HH:mm");
            return;
        }

        if (formValues.outputDir.trim() === "") {
            toast.error("Specifica una cartella di destinazione per il dump");
            return;
        }

        if (!Number.isInteger(formValues.maxBackupsToKeep) || formValues.maxBackupsToKeep <= 0) {
            toast.error("Il numero di backup da mantenere deve essere un numero intero positivo");
            return;
        }

        if (formValues.notifyEmailOnFailure && !emailConfigured) {
            toast.error("Configura prima l'invio email nelle impostazioni per attivare questo avviso");
            return;
        }

        if (formValues.smbEnabled) {
            if (!formValues.smbHost.trim() || !formValues.smbShare.trim() || !formValues.smbUsername.trim()) {
                toast.error("Per il NAS specifica almeno host, condivisione e utente");
                return;
            }

            if (!smbPasswordSet && !formValues.smbPassword?.trim()) {
                toast.error("Specifica una password per la connessione al NAS");
                return;
            }

            if (!Number.isInteger(formValues.smbPort) || formValues.smbPort <= 0 || formValues.smbPort > 65535) {
                toast.error("La porta SMB deve essere un numero valido");
                return;
            }
        }

        try {
            setIsSaving(true);
            const settings = await updateBackupSettings({
                ...formValues,
                outputDir: formValues.outputDir.trim(),
                smbHost: formValues.smbHost.trim(),
                smbShare: formValues.smbShare.trim(),
                smbPath: formValues.smbPath.trim(),
                smbDomain: formValues.smbDomain.trim(),
                smbUsername: formValues.smbUsername.trim(),
            });

            setLastRunAt(settings.lastRunAt);
            setLastRunStatus(settings.lastRunStatus);
            setLastError(settings.lastError);
            setNextRunAt(settings.nextRunAt);
            setLastDumpPath(settings.lastDumpPath);
            setEmailConfigured(settings.emailConfigured);
            setSmbPasswordSet(settings.smbPasswordSet);
            setSmbLastRunAt(settings.smbLastRunAt);
            setSmbLastStatus(settings.smbLastStatus);
            setSmbLastError(settings.smbLastError);
            const nextSavedValues: BackupSettingsInput = {
                autoEnabled: settings.autoEnabled,
                frequencyDays: settings.frequencyDays,
                runAt: settings.runAt,
                outputDir: settings.outputDir,
                maxBackupsToKeep: settings.maxBackupsToKeep,
                notifyEmailOnFailure: settings.notifyEmailOnFailure,
                smbEnabled: settings.smbEnabled,
                smbHost: settings.smbHost,
                smbShare: settings.smbShare,
                smbPath: settings.smbPath,
                smbDomain: settings.smbDomain,
                smbPort: settings.smbPort,
                smbUsername: settings.smbUsername,
                smbPassword: "",
            };
            // Il form prende i valori salvati, non resta com'era: quelli inviati sono ripuliti
            // dagli spazi, e un " nas.local " rimasto nel campo contro il "nas.local" salvato
            // lasciava il form "modificato" (e Salva attivo) subito dopo il salvataggio.
            // Come in `CompanySettingsPanel`.
            setFormValues(nextSavedValues);
            setSavedValues(nextSavedValues);
            toast.success("Impostazioni backup salvate");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare le impostazioni backup"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestSmbConnection = async () => {
        if (isTestingSmb) {
            return;
        }

        if (!formValues.smbHost.trim() || !formValues.smbShare.trim() || !formValues.smbUsername.trim()) {
            toast.error("Per testare la connessione specifica almeno host, condivisione e utente");
            return;
        }

        const password = formValues.smbPassword?.trim();

        if (!password) {
            toast.error("Inserisci la password nel campo qui sopra per testare la connessione");
            return;
        }

        try {
            setIsTestingSmb(true);
            const result = await testSmbConnection({
                host: formValues.smbHost.trim(),
                share: formValues.smbShare.trim(),
                path: formValues.smbPath.trim(),
                domain: formValues.smbDomain.trim(),
                port: formValues.smbPort,
                username: formValues.smbUsername.trim(),
                password,
            });
            toast.success(result.message);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Connessione al NAS non riuscita"));
        } finally {
            setIsTestingSmb(false);
        }
    };

    const handleDownloadDump = (fileName: string) => {
        window.location.assign(getBackupDumpDownloadUrl(fileName));
    };

    const handleRunBackup = async () => {
        if (isRunningBackup || isLoading) {
            return;
        }

        try {
            setIsRunningBackup(true);
            setBusy({
                title: "Backup in corso...",
                description: formValues.smbEnabled
                    ? "Non chiudere o ricaricare la pagina: il database viene esportato e copiato sul NAS. Può richiedere alcuni minuti in base alla dimensione dei dati."
                    : "Non chiudere o ricaricare la pagina: l'operazione può richiedere alcuni minuti in base alla dimensione dei dati.",
            });

            const result = await runBackupNow();
            setLastRunAt(result.lastRunAt);
            setLastRunStatus(result.lastRunStatus);
            setLastError(result.lastError);
            setNextRunAt(result.nextRunAt);
            setLastDumpPath(result.lastDumpPath);
            setSmbLastRunAt(result.smbLastRunAt);
            setSmbLastStatus(result.smbLastStatus);
            setSmbLastError(result.smbLastError);

            if (result.smbEnabled && result.smbLastStatus === "failed") {
                toast.warning(result.message, { richColors: true });
            } else {
                toast.success(result.message);
            }

            void loadDumpFiles();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Dump database non riuscito"));
        } finally {
            setIsRunningBackup(false);
            setBusy(null);
        }
    };

    const handleRestoreFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        setRestoreUploadFile(file);
    };

    const openRestoreConfirm = (source: PendingRestore) => {
        setPendingRestore(source);
        setRestoreConfirmText("");
        setRestoreBackupKeyInput("");
    };

    const closeRestoreConfirm = () => {
        if (isRestoring) {
            return;
        }

        setPendingRestore(null);
        setRestoreConfirmText("");
        setRestoreBackupKeyInput("");
    };

    const handleRevealBackupKey = async () => {
        if (isLoadingBackupKey || backupKey) {
            return;
        }

        try {
            setIsLoadingBackupKey(true);
            const result = await getBackupKey();
            setBackupKey(result.key);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile recuperare la chiave di backup"));
        } finally {
            setIsLoadingBackupKey(false);
        }
    };

    const handleConfirmRestore = async () => {
        if (!pendingRestore || isRestoring) {
            return;
        }

        try {
            setIsRestoring(true);
            setBusy({
                title: "Ripristino database in corso...",
                description:
                    "Non chiudere o ricaricare la pagina: l'operazione può richiedere alcuni minuti in base alla dimensione del dump.",
            });

            const backupKeyOverride = restoreBackupKeyInput.trim() || undefined;
            const result = backupKeyOverride
                ? pendingRestore.type === "existing"
                    ? await restoreBackupFromExisting(pendingRestore.fileName, resetSchemaOnRestore, backupKeyOverride)
                    : await restoreBackupFromUpload(pendingRestore.file, resetSchemaOnRestore, backupKeyOverride)
                : pendingRestore.type === "existing"
                  ? await restoreBackupFromExisting(pendingRestore.fileName, resetSchemaOnRestore)
                  : await restoreBackupFromUpload(pendingRestore.file, resetSchemaOnRestore);

            setLastRestoreAt(result.lastRestoreAt);
            setLastRestoreStatus(result.lastRestoreStatus);
            setLastRestoreError(result.lastRestoreError);
            setLastRestoreFileName(result.lastRestoreFileName);
            setSecretsToReconfigure(result.restoreSecretsToReconfigure);

            if (result.restoreSecretsToReconfigure.length > 0) {
                toast.warning(result.message, { richColors: true });
            } else {
                toast.success(result.message);
            }

            setPendingRestore(null);
            setRestoreConfirmText("");
            setRestoreUploadFile(null);
            setIsRestoring(false);
            setBusy(null);

            // I dati utente/sessione ripristinati non coincidono più con quelli con cui si è
            // effettuato l'accesso: forziamo un nuovo login per ripartire da uno stato coerente.
            // Navighiamo prima (senza "from" in state) così dopo il login si atterra sulla
            // dashboard e non sulla stessa pagina impostazioni da cui è partito il ripristino.
            navigate("/login", { replace: true });

            try {
                await logout();
            } catch {
                // La sessione corrente potrebbe già non esistere più nel database ripristinato.
            }
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Ripristino database non riuscito"));
            setIsRestoring(false);
            setBusy(null);
        }
    };

    const totalDumpsSize = dumpFiles.reduce((total, dump) => total + dump.sizeBytes, 0);

    return {
        isLoading,
        isSaving,
        isRunningBackup,
        formValues,
        setFormValues,
        isDirty,
        lastRunAt,
        lastRunStatus,
        lastError,
        nextRunAt,
        lastDumpPath,
        emailConfigured,
        dumpFiles,
        isLoadingDumps,
        totalDumpsSize,
        smbPasswordSet,
        smbLastRunAt,
        smbLastStatus,
        smbLastError,
        isTestingSmb,
        restoreUploadFile,
        resetSchemaOnRestore,
        setResetSchemaOnRestore,
        isRestoring,
        pendingRestore,
        restoreConfirmText,
        setRestoreConfirmText,
        lastRestoreAt,
        lastRestoreStatus,
        lastRestoreError,
        lastRestoreFileName,
        secretsToReconfigure,
        restoreBackupKeyInput,
        setRestoreBackupKeyInput,
        backupKey,
        isLoadingBackupKey,
        loadDumpFiles,
        handleSave,
        handleTestSmbConnection,
        handleDownloadDump,
        handleRunBackup,
        handleRestoreFileSelected,
        openRestoreConfirm,
        closeRestoreConfirm,
        handleConfirmRestore,
        handleRevealBackupKey,
    };
};

export type BackupPanel = ReturnType<typeof useBackupPanel>;
