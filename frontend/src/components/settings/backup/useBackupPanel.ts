import { startTransition, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/components/use-auth";
import { useBusyGuard } from "@/components/use-busy-guard";
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
    type BackupSettingsDto,
    type BackupSettingsInput,
} from "@/lib/api";
import { isSettingsFormDirty } from "@/lib/settingsForm";
import { useSettingsForm } from "@/hooks/useSettingsForm";

export const restoreConfirmKeyword = "RESTORE";

export type PendingRestore = { type: "existing"; fileName: string } | { type: "upload"; file: File };

/**
 * I campi del form che hanno una validazione. Il nome è anche l'`id` del controllo nella
 * pagina, così l'errore sa sotto quale campo andare (vedi `FieldError`) e quale mettere a fuoco.
 * L'ordine è quello della pagina: il focus va al primo sbagliato.
 */
const validatedFields = [
    "frequencyDays",
    "runAt",
    "maxBackupsToKeep",
    "notifyEmailOnFailure",
    "smbHost",
    "smbShare",
    "smbPort",
    "smbUsername",
    "smbPassword",
] as const;

export type BackupField = (typeof validatedFields)[number];
export type BackupFieldErrors = Partial<Record<BackupField, string>>;

const smbFields: BackupField[] = ["smbHost", "smbShare", "smbPort", "smbUsername", "smbPassword"];

const defaultForm: BackupSettingsInput = {
    autoEnabled: false,
    frequencyDays: 1,
    runAt: "02:00",
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

// La cartella è solo da mostrare: è quella montata dal compose, il server non la fa scegliere.
const defaultOutputDir = "backups";

/**
 * I campi modificabili del form, letti dal DTO intero che arriva dal server: come
 * `updateSettingsPanel.tsx` fa con `status`, ma lì il pannello è di sola lettura e qui c'è
 * anche un form da modificare, quindi serve la proiezione sui soli campi che il form scrive
 * (più `smbPassword`, che il server non restituisce mai).
 *
 * Prima questa stessa conversione era scritta due volte, identica, nel caricamento e nel
 * salvataggio (ora li fa `useSettingsForm`); e le 16 informazioni di sola lettura
 * (`lastRunAt`, `smbLastStatus`, ...) erano altrettanti `useState` riassegnati con un sottoinsieme diverso di setter in ognuno
 * dei quattro punti che ricevono il DTO intero dal server (caricamento, salvataggio,
 * esecuzione del dump, ripristino) — tanto che `lastRunOrigin` non veniva mai ripreso da
 * nessuno dei quattro.
 */
const toFormValues = (settings: BackupSettingsDto): BackupSettingsInput => ({
    autoEnabled: settings.autoEnabled,
    frequencyDays: settings.frequencyDays,
    runAt: settings.runAt,
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
});

/** Host, condivisione e utente del NAS, che salvataggio e prova di connessione chiedono entrambi. */
const smbRequiredErrors = (values: BackupSettingsInput, prefix: string): BackupFieldErrors => {
    const nextErrors: BackupFieldErrors = {};
    const message = (what: string) => (prefix ? `${prefix} specifica ${what}` : `Specifica ${what}`);

    if (!values.smbHost.trim()) {
        nextErrors.smbHost = message("l'host del NAS");
    }

    if (!values.smbShare.trim()) {
        nextErrors.smbShare = message("il nome della condivisione");
    }

    if (!values.smbUsername.trim()) {
        nextErrors.smbUsername = message("l'utente del NAS");
    }

    return nextErrors;
};

/**
 * Le regole del salvataggio. Gli errori vanno sotto i campi, non in un toast: il messaggio resta
 * finché non lo si corregge e dice *quale* campo è il problema, mentre un toast spariva dopo
 * pochi secondi senza dirlo. I toast restano per il server.
 */
const validateBackupForm = (values: BackupSettingsInput, settings: BackupSettingsDto | null): BackupFieldErrors => {
    const nextErrors: BackupFieldErrors = {};

    if (!Number.isInteger(values.frequencyDays) || values.frequencyDays <= 0) {
        nextErrors.frequencyDays = "La frequenza deve essere un numero intero positivo";
    }

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(values.runAt)) {
        nextErrors.runAt = "L'orario deve essere nel formato HH:mm";
    }

    if (!Number.isInteger(values.maxBackupsToKeep) || values.maxBackupsToKeep <= 0) {
        nextErrors.maxBackupsToKeep = "Il numero di backup da mantenere deve essere un numero intero positivo";
    }

    if (values.notifyEmailOnFailure && !settings?.emailConfigured) {
        nextErrors.notifyEmailOnFailure = "Configura prima l'invio email nelle impostazioni per attivare questo avviso";
    }

    if (values.smbEnabled) {
        Object.assign(nextErrors, smbRequiredErrors(values, ""));

        if (!settings?.smbPasswordSet && !values.smbPassword?.trim()) {
            nextErrors.smbPassword = "Specifica una password per la connessione al NAS";
        }

        if (!Number.isInteger(values.smbPort) || values.smbPort <= 0 || values.smbPort > 65535) {
            nextErrors.smbPort = "La porta SMB deve essere un numero valido";
        }
    }

    return nextErrors;
};

type Options = {
    /** Chiamata a ogni cambio di "ci sono modifiche non salvate", e con `false` allo smontaggio. */
    onDirtyChange?: (isDirty: boolean) => void;
};

/**
 * Tutto lo stato e le azioni del pannello backup. Sta in un hook separato dalle schede
 * che lo mostrano perché il pannello ha una ventina di variabili di stato condivise fra
 * schede diverse: passarle come prop una per una renderebbe illeggibili le firme, e
 * duplicarle per scheda le disallineerebbe (lo stesso `lastRunStatus` è aggiornato sia
 * dal salvataggio sia dall'esecuzione del dump).
 */
export const useBackupPanel = ({ onDirtyChange }: Options = {}) => {
    const { setBusy } = useBusyGuard();
    const { logout } = useAuth();
    const navigate = useNavigate();
    // `settings` è l'ultimo DTO arrivato dal server: unica fonte sia dei campi di sola lettura
    // (stato dell'ultima esecuzione, del NAS, del ripristino...) sia dei valori salvati, con cui
    // si confronta il form per `isDirty`. `null` finché non è ancora arrivato nulla.
    const {
        data: settings,
        setData: setSettings,
        formValues,
        setFormValues,
        isDirty,
        isLoading,
        isSaving,
        errors,
        setErrors,
        reportErrors,
        handleSave,
    } = useSettingsForm({
        load: getBackupSettings,
        save: (values) =>
            updateBackupSettings({
                ...values,
                smbHost: values.smbHost.trim(),
                smbShare: values.smbShare.trim(),
                smbPath: values.smbPath.trim(),
                smbDomain: values.smbDomain.trim(),
                smbUsername: values.smbUsername.trim(),
            }),
        toForm: toFormValues,
        defaultValues: defaultForm,
        validate: validateBackupForm,
        fieldOrder: validatedFields,
        // La password del NAS non torna mai dal server: scriverne una nuova è di per sé una modifica.
        isDirty: (current, saved) => isSettingsFormDirty(current, saved, ["smbPassword"]),
        onDirtyChange,
        messages: {
            loadError: "Impossibile caricare le impostazioni backup",
            saveError: "Impossibile salvare le impostazioni backup",
            saved: "Impostazioni backup salvate",
        },
    });
    const [isRunningBackup, setIsRunningBackup] = useState(false);
    const [dumpFiles, setDumpFiles] = useState<BackupDumpFileDto[]>([]);
    const [isLoadingDumps, setIsLoadingDumps] = useState(false);
    const [isTestingSmb, setIsTestingSmb] = useState(false);

    const [restoreUploadFile, setRestoreUploadFile] = useState<File | null>(null);
    const [resetSchemaOnRestore, setResetSchemaOnRestore] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
    const [restoreConfirmText, setRestoreConfirmText] = useState("");
    const [restoreBackupKeyInput, setRestoreBackupKeyInput] = useState("");
    const [restorePassword, setRestorePassword] = useState("");
    const [backupKey, setBackupKey] = useState<string | null>(null);
    const [isLoadingBackupKey, setIsLoadingBackupKey] = useState(false);
    const [isBackupKeyDialogOpen, setIsBackupKeyDialogOpen] = useState(false);
    const [backupKeyPassword, setBackupKeyPassword] = useState("");

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

    // Caricamento iniziale dell'elenco dei dump: gira una volta sola al montaggio del pannello
    // (le impostazioni le carica `useSettingsForm`).
    useEffect(() => {
        startTransition(() => {
            void loadDumpFiles();
        });
    }, []);

    /**
     * Aggiorna il form e toglie l'errore dei campi toccati: chi lo sta correggendo non deve
     * rivederlo. Spegnere o riaccendere la copia sul NAS toglie tutti quelli del NAS, che da
     * spento non si validano.
     */
    const changeFormValues = (values: Partial<BackupSettingsInput>) => {
        setFormValues((prev) => ({ ...prev, ...values }));
        setErrors((prev) => {
            const touched = "smbEnabled" in values ? [...Object.keys(values), ...smbFields] : Object.keys(values);
            return Object.fromEntries(Object.entries(prev).filter(([field]) => !touched.includes(field)));
        });
    };

    const handleTestSmbConnection = async () => {
        if (isTestingSmb) {
            return;
        }

        const password = formValues.smbPassword?.trim();
        const nextErrors = smbRequiredErrors(formValues, "Per testare la connessione");

        // Anche con una password già salvata: quella resta sul server, la prova usa la scritta.
        if (!password) {
            nextErrors.smbPassword = "Per testare la connessione scrivi la password";
        }

        // `!password` è già fra gli errori: qui serve a TypeScript, che non lo sa.
        if (reportErrors(nextErrors) || !password) {
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
            setSettings(result);

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
        setRestorePassword("");
    };

    const closeRestoreConfirm = () => {
        if (isRestoring) {
            return;
        }

        setPendingRestore(null);
        setRestoreConfirmText("");
        setRestoreBackupKeyInput("");
        setRestorePassword("");
    };

    const openBackupKeyDialog = () => {
        if (backupKey) {
            return;
        }

        setBackupKeyPassword("");
        setIsBackupKeyDialogOpen(true);
    };

    const closeBackupKeyDialog = () => {
        if (isLoadingBackupKey) {
            return;
        }

        setIsBackupKeyDialogOpen(false);
        setBackupKeyPassword("");
    };

    const handleRevealBackupKey = async () => {
        if (isLoadingBackupKey || backupKey || !backupKeyPassword) {
            return;
        }

        try {
            setIsLoadingBackupKey(true);
            const result = await getBackupKey(backupKeyPassword);
            setBackupKey(result.key);
            setIsBackupKeyDialogOpen(false);
            setBackupKeyPassword("");
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
            const result =
                pendingRestore.type === "existing"
                    ? await restoreBackupFromExisting(
                          pendingRestore.fileName,
                          resetSchemaOnRestore,
                          restorePassword,
                          backupKeyOverride
                      )
                    : await restoreBackupFromUpload(
                          pendingRestore.file,
                          resetSchemaOnRestore,
                          restorePassword,
                          backupKeyOverride
                      );

            setSettings(result);

            if (result.restoreSecretsToReconfigure.length > 0) {
                toast.warning(result.message, { richColors: true });
            } else {
                toast.success(result.message);
            }

            setPendingRestore(null);
            setRestoreConfirmText("");
            setRestorePassword("");
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
        changeFormValues,
        errors,
        isDirty,
        outputDir: settings?.outputDir ?? defaultOutputDir,
        lastRunAt: settings?.lastRunAt ?? null,
        lastRunStatus: settings?.lastRunStatus ?? "idle",
        lastError: settings?.lastError ?? null,
        nextRunAt: settings?.nextRunAt ?? null,
        lastDumpPath: settings?.lastDumpPath ?? null,
        emailConfigured: settings?.emailConfigured ?? false,
        dumpFiles,
        isLoadingDumps,
        totalDumpsSize,
        smbPasswordSet: settings?.smbPasswordSet ?? false,
        smbLastRunAt: settings?.smbLastRunAt ?? null,
        smbLastStatus: settings?.smbLastStatus ?? "idle",
        smbLastError: settings?.smbLastError ?? null,
        isTestingSmb,
        restoreUploadFile,
        resetSchemaOnRestore,
        setResetSchemaOnRestore,
        isRestoring,
        pendingRestore,
        restoreConfirmText,
        setRestoreConfirmText,
        lastRestoreAt: settings?.lastRestoreAt ?? null,
        lastRestoreStatus: settings?.lastRestoreStatus ?? "idle",
        lastRestoreError: settings?.lastRestoreError ?? null,
        lastRestoreFileName: settings?.lastRestoreFileName ?? null,
        secretsToReconfigure: settings?.restoreSecretsToReconfigure ?? [],
        restoreBackupKeyInput,
        setRestoreBackupKeyInput,
        restorePassword,
        setRestorePassword,
        backupKey,
        isLoadingBackupKey,
        isBackupKeyDialogOpen,
        backupKeyPassword,
        setBackupKeyPassword,
        loadDumpFiles,
        handleSave,
        handleTestSmbConnection,
        handleDownloadDump,
        handleRunBackup,
        handleRestoreFileSelected,
        openRestoreConfirm,
        closeRestoreConfirm,
        handleConfirmRestore,
        openBackupKeyDialog,
        closeBackupKeyDialog,
        handleRevealBackupKey,
    };
};

export type BackupPanel = ReturnType<typeof useBackupPanel>;
