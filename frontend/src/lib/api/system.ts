import { api } from "./client";

export type UpdateStatusDto = {
    state: "unknown" | "idle" | "running" | "success" | "failed";
    currentCommit: string | null;
    remoteCommit: string | null;
    updateAvailable: boolean;
    lastCheckedAt: string | null;
    lastUpdateAt: string | null;
    lastUpdateStatus: "success" | "failed" | null;
    lastError: string | null;
    log: string | null;
};

/** Lo stato nudo, leggibile da qualunque utente autenticato: vedi hooks/useUpdateWatcher.ts. */
export type UpdateStateDto = { state: UpdateStatusDto["state"] };

export const getUpdateStatus = async () => (await api.get<UpdateStatusDto>("/settings/update")).data;

export const getUpdateState = async () => (await api.get<UpdateStateDto>("/settings/update-state")).data;

export const runUpdateNow = async () => (await api.post<UpdateStatusDto>("/settings/update/run")).data;

export const checkForUpdates = async () => (await api.post<UpdateStatusDto>("/settings/update/check")).data;
