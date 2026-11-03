import { api } from "./client";

/** A che punto è la ricostruzione dei container (approssimato: vedi UpdateBuildProgress nel backend). */
export type UpdateBuildDto = { service: string; step: number; total: number; name: string };

export type UpdateStatusDto = {
    state: "unknown" | "idle" | "running" | "success" | "failed";
    phase: "verify" | "code" | "build" | "cleanup" | null;
    /** Assente o `null` con lo script di aggiornamento vecchio, che non lo scrive. */
    build?: UpdateBuildDto | null;
    currentCommit: string | null;
    /** Il tag di rilascio installato ("v1.2.0", "v1.2.0 + 3 commit"); il commit se non ce n'è uno. */
    currentVersion: string | null;
    remoteCommit: string | null;
    /** Il tag di rilascio da installare; `null` se non c'è un aggiornamento. */
    remoteVersion: string | null;
    updateAvailable: boolean;
    lastCheckedAt: string | null;
    lastUpdateAt: string | null;
    lastUpdateStatus: "success" | "failed" | null;
    lastError: string | null;
    log: string | null;
};

/** Lo stato nudo, leggibile da qualunque utente autenticato: vedi hooks/useUpdateWatcher.ts. */
export type UpdateStateDto = Pick<UpdateStatusDto, "state" | "phase" | "build">;

export const getUpdateStatus = async () => (await api.get<UpdateStatusDto>("/settings/update")).data;

export const getUpdateState = async () => (await api.get<UpdateStateDto>("/settings/update-state")).data;

export const runUpdateNow = async () => (await api.post<UpdateStatusDto>("/settings/update/run")).data;

export const checkForUpdates = async () => (await api.post<UpdateStatusDto>("/settings/update/check")).data;
