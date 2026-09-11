import { api } from "./client";
import type { PaginatedResponse } from "./client";

export type BackupSettingsDto = {
    autoEnabled: boolean;
    frequencyDays: number;
    runAt: string;
    outputDir: string;
    maxBackupsToKeep: number;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastRunStatus: "idle" | "success" | "failed";
    /** Chi ha avviato l'ultima esecuzione: i fallimenti automatici non li ha visti nessuno. */
    lastRunOrigin: "manual" | "auto" | null;
    lastError: string | null;
    lastDumpPath: string | null;
    /** Avvisa via email (oltre alla notifica in app) quando un backup automatico fallisce. */
    notifyEmailOnFailure: boolean;
    /** True se le impostazioni email sono configurate e la checkbox può essere attivata. */
    emailConfigured: boolean;
    smbEnabled: boolean;
    smbHost: string;
    smbShare: string;
    smbPath: string;
    smbDomain: string;
    smbPort: number;
    smbUsername: string;
    smbPasswordSet: boolean;
    smbLastRunAt: string | null;
    smbLastStatus: "idle" | "success" | "failed";
    smbLastError: string | null;
    lastRestoreAt: string | null;
    lastRestoreStatus: "idle" | "success" | "failed";
    lastRestoreError: string | null;
    lastRestoreFileName: string | null;
    /** Segreti che il ripristino non ha potuto rileggere e vanno reinseriti a mano. */
    restoreSecretsToReconfigure: string[];
};

export type BackupSettingsInput = Pick<
    BackupSettingsDto,
    | "autoEnabled"
    | "frequencyDays"
    | "runAt"
    | "outputDir"
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

export const getBackupSettings = async () => (await api.get<BackupSettingsDto>("/settings/backup")).data;

export const updateBackupSettings = async (payload: BackupSettingsInput) =>
    (await api.put<BackupSettingsDto>("/settings/backup", payload)).data;

export const runBackupNow = async () =>
    (await api.post<BackupSettingsDto & { message: string }>("/settings/backup/run")).data;

export type SmbConnectionTestInput = {
    host: string;
    share: string;
    path: string;
    domain: string;
    port: number;
    username: string;
    password: string;
};

export const testSmbConnection = async (payload: SmbConnectionTestInput) =>
    (await api.post<{ message: string }>("/settings/backup/smb/test", payload)).data;

export type BackupDumpFileDto = {
    fileName: string;
    sizeBytes: number;
    createdAt: string;
};

export const listBackupDumps = async () => (await api.get<BackupDumpFileDto[]>("/settings/backup/list")).data;

export const getBackupDumpDownloadUrl = (fileName: string) =>
    api.getUri({ url: `/settings/backup/download/${encodeURIComponent(fileName)}` });

export type RestoreBackupResult = BackupSettingsDto & { message: string };

export const restoreBackupFromExisting = async (fileName: string, resetSchema: boolean, backupKey?: string) =>
    (
        await api.post<RestoreBackupResult>("/settings/backup/restore", {
            fileName,
            resetSchema,
            ...(backupKey ? { backupKey } : {}),
        })
    ).data;

export const restoreBackupFromUpload = async (file: File, resetSchema: boolean, backupKey?: string) => {
    const formData = new FormData();
    formData.append("dump", file);
    formData.append("resetSchema", String(resetSchema));

    if (backupKey) {
        formData.append("backupKey", backupKey);
    }

    return (await api.post<RestoreBackupResult>("/settings/backup/restore/upload", formData)).data;
};

/** Chiave che cifra l'archivio di backup: va esportata e conservata altrove, perché non
 * viene mai inclusa nell'archivio stesso (vedi backend/src/services/backupKey.ts). */
export const getBackupKey = async () => (await api.get<{ key: string }>("/settings/backup/key")).data;

export type LogoStatusDto = {
    hasCustomLogo: boolean;
    updatedAt: string | null;
};

export const getLogoStatus = async () => (await api.get<LogoStatusDto>("/settings/logo")).data;

export const uploadLogo = async (file: File) => {
    const formData = new FormData();
    formData.append("logo", file);

    return (await api.post<LogoStatusDto>("/settings/logo", formData)).data;
};

export const resetLogo = async () => (await api.delete<LogoStatusDto>("/settings/logo")).data;

export type LogFileDto = {
    dayKey: string;
    sizeBytes: number;
    updatedAt: string;
};

export type LogEntryDto = {
    timestamp: string;
    ip: string;
    user: string;
    action: string;
    status: number;
    error: string | null;
};

export const listLogFiles = async () => (await api.get<LogFileDto[]>("/settings/logs")).data;

export type ListLogEntriesParams = {
    page?: number;
    pageSize?: number;
    search?: string;
};

export const listLogEntries = async (dayKey: string, params: ListLogEntriesParams = {}) =>
    (
        await api.get<PaginatedResponse<LogEntryDto>>(`/settings/logs/${encodeURIComponent(dayKey)}`, {
            params: {
                page: params.page ?? 1,
                pageSize: params.pageSize ?? 50,
                search: params.search?.trim() || undefined,
            },
        })
    ).data;

export const getLogDownloadUrl = (dayKey: string) =>
    api.getUri({ url: `/settings/logs/${encodeURIComponent(dayKey)}/download` });

export type CompanySettingsDto = {
    name: string;
    email: string;
    address: string;
    phone: string;
};

export type CompanySettingsInput = CompanySettingsDto;

export const getCompanySettings = async () => (await api.get<CompanySettingsDto>("/settings/company")).data;

export const updateCompanySettings = async (payload: CompanySettingsInput) =>
    (await api.put<CompanySettingsDto>("/settings/company", payload)).data;

export type EmailSettingsDto = {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromName: string;
    fromEmail: string;
    passwordSet: boolean;
};

export type EmailSettingsInput = Pick<
    EmailSettingsDto,
    "enabled" | "host" | "port" | "secure" | "username" | "fromName" | "fromEmail"
> & { password?: string };

export const getEmailSettings = async () => (await api.get<EmailSettingsDto>("/settings/email")).data;

export const updateEmailSettings = async (payload: EmailSettingsInput) =>
    (await api.put<EmailSettingsDto>("/settings/email", payload)).data;

export type EmailConnectionTestInput = {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromName: string;
    fromEmail: string;
};

export const testEmailConnection = async (payload: EmailConnectionTestInput) =>
    (await api.post<{ message: string }>("/settings/email/test", payload)).data;
