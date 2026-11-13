import { api } from "./client";

/** A che punto è la ricostruzione dei container (approssimato: vedi UpdateBuildProgress nel backend). */
export type UpdateBuildDto = { service: string; step: number; total: number; name: string };

/** L'esito dell'ultimo aggiornamento programmato: "cancelled" = scaduto perché il server era spento. */
export type UpdateScheduleOutcome = "success" | "failed" | "cancelled";

/** La programmazione di un aggiornamento (solo amministratore): vedi `updateSchedule.ts` nel backend. */
export type UpdateScheduleDto = {
    /** L'istante programmato (ISO), `null` se non c'è nulla in programma. */
    scheduledAt: string | null;
    scheduledBy: string | null;
    lastOutcome: UpdateScheduleOutcome | null;
    lastOutcomeAt: string | null;
    lastOutcomeMessage: string | null;
};

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
    schedule: UpdateScheduleDto;
};

/** Lo stato nudo, leggibile da qualunque utente autenticato: vedi hooks/useUpdateWatcher.ts. */
export type UpdateStateDto = Pick<UpdateStatusDto, "state" | "phase" | "build"> & {
    /** Quando c'è un aggiornamento programmato, per il banner che lo annuncia a tutti. */
    scheduledAt?: string | null;
};

/** Le informazioni sugli aggiornamenti per chi non è amministratore: niente commit, errore e log. */
export type UpdateInfoDto = Pick<
    UpdateStatusDto,
    | "state"
    | "currentVersion"
    | "remoteVersion"
    | "updateAvailable"
    | "lastCheckedAt"
    | "lastUpdateAt"
    | "lastUpdateStatus"
> & { scheduledAt?: string | null };

export const getUpdateInfo = async () => (await api.get<UpdateInfoDto>("/settings/update-info")).data;

export const getUpdateStatus = async () => (await api.get<UpdateStatusDto>("/settings/update")).data;

export const getUpdateState = async () => (await api.get<UpdateStateDto>("/settings/update-state")).data;

export const runUpdateNow = async () => (await api.post<UpdateStatusDto>("/settings/update/run")).data;

export type ScheduleUpdateInput = {
    /** "AAAA-MM-GG", ora del laboratorio. */
    date: string;
    /** "HH:mm", ora del laboratorio. */
    time: string;
};

export const scheduleUpdate = async (input: ScheduleUpdateInput) =>
    (await api.put<UpdateScheduleDto>("/settings/update/schedule", input)).data;

export const cancelScheduledUpdate = async () =>
    (await api.delete<UpdateScheduleDto>("/settings/update/schedule")).data;

export const checkForUpdates = async () => (await api.post<UpdateStatusDto>("/settings/update/check")).data;
