import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./apiError";

// This service only touches files. The actual `git`/`docker compose` work runs
// on the VM host, triggered by a systemd path unit watching these files (see
// ops/systemd/ and scripts/update-server.sh / scripts/check-updates.sh). The
// backend container has no docker/git access on purpose.
const signalDir = path.join(process.cwd(), "update-signal");
const statusFilePath = path.join(signalDir, "status.json");
const applyTriggerPath = path.join(signalDir, "apply.trigger");
const checkTriggerPath = path.join(signalDir, "check.trigger");

type UpdateStatusState = "unknown" | "idle" | "running" | "success" | "failed";

export type UpdateStatus = {
    state: UpdateStatusState;
    currentCommit: string | null;
    remoteCommit: string | null;
    updateAvailable: boolean;
    lastCheckedAt: string | null;
    lastUpdateAt: string | null;
    lastUpdateStatus: "success" | "failed" | null;
    lastError: string | null;
    log: string | null;
};

export class UpdateManagerError extends ApiError {}

const defaultStatus: UpdateStatus = {
    state: "unknown",
    currentCommit: null,
    remoteCommit: null,
    updateAvailable: false,
    lastCheckedAt: null,
    lastUpdateAt: null,
    lastUpdateStatus: null,
    lastError: null,
    log: null,
};

const validStates: UpdateStatusState[] = ["unknown", "idle", "running", "success", "failed"];

// Defensive: the host script is the only writer of status.json, so treat its
// contents as untrusted input and fill in sane defaults for anything missing
// or malformed rather than throwing.
const sanitizeStatus = (input: Partial<UpdateStatus> | null | undefined): UpdateStatus => ({
    state: validStates.includes(input?.state as UpdateStatusState) ? (input!.state as UpdateStatusState) : "unknown",
    currentCommit: typeof input?.currentCommit === "string" ? input.currentCommit : null,
    remoteCommit: typeof input?.remoteCommit === "string" ? input.remoteCommit : null,
    updateAvailable: Boolean(input?.updateAvailable),
    lastCheckedAt: typeof input?.lastCheckedAt === "string" ? input.lastCheckedAt : null,
    lastUpdateAt: typeof input?.lastUpdateAt === "string" ? input.lastUpdateAt : null,
    lastUpdateStatus:
        input?.lastUpdateStatus === "success" || input?.lastUpdateStatus === "failed" ? input.lastUpdateStatus : null,
    lastError: typeof input?.lastError === "string" ? input.lastError : null,
    log: typeof input?.log === "string" ? input.log : null,
});

export const getUpdateStatus = async (): Promise<UpdateStatus> => {
    try {
        const raw = await fs.promises.readFile(statusFilePath, "utf-8");
        return sanitizeStatus(JSON.parse(raw) as Partial<UpdateStatus>);
    } catch {
        return { ...defaultStatus };
    }
};

const ensureNotRunning = async () => {
    const status = await getUpdateStatus();

    if (status.state === "running") {
        throw new UpdateManagerError("Un aggiornamento è già in corso", 409);
    }
};

const touchTrigger = async (triggerPath: string) => {
    await fs.promises.mkdir(signalDir, { recursive: true });
    await fs.promises.writeFile(triggerPath, "", "utf-8");
};

export const requestUpdate = async () => {
    await ensureNotRunning();
    await touchTrigger(applyTriggerPath);
    return getUpdateStatus();
};

export const requestUpdateCheck = async () => {
    await ensureNotRunning();
    await touchTrigger(checkTriggerPath);
    return getUpdateStatus();
};
