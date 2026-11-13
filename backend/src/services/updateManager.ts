import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./apiError";

// This service only touches files. The actual `git`/`docker compose` work runs
// on the VM host, triggered by a systemd path unit watching these files (see
// ops/systemd/ and scripts/update-server.sh / scripts/check-updates.sh). The
// backend container has no docker/git access on purpose.
//
// Two directories, one per direction (see scripts/update-status-lib.sh): the triggers go
// into `update-signal`, which this container owns; the status comes from `update-status`,
// written by root on the host and mounted read-only. The status used to sit next to the
// triggers, where code running here could replace it with a symlink that the root scripts
// then followed (EL-01 in docs/CHANGELOG.md).
const signalDir = path.join(process.cwd(), "update-signal");
const statusFilePath = path.join(process.cwd(), "update-status", "status.json");
const applyTriggerPath = path.join(signalDir, "apply.trigger");
const checkTriggerPath = path.join(signalDir, "check.trigger");

type UpdateStatusState = "unknown" | "idle" | "running" | "success" | "failed";

// Le fasi che scripts/update-server.sh attraversa mentre `state` è "running": scritte lì una
// per volta, servono solo a dire all'utente a che punto siamo durante i minuti di attesa, non
// sono usate per nessuna logica qui. Tenute in sync a mano con quell'elenco di `write_status`.
type UpdatePhase = "verify" | "code" | "build" | "cleanup";

const validPhases: UpdatePhase[] = ["verify", "code", "build", "cleanup"];

// Dove sta arrivando la ricostruzione dei container, ricavato da scripts/update-server.sh
// dalle righe di BuildKit ("#12 [backend 5/9] RUN ..."). Approssimato: i servizi si
// costruiscono in parallelo, quindi � l'ultima riga che si � mossa, e i totali sono per stadio.
// Opzionale in status.json: lo script vecchio, che fa sempre per primo la transizione, non lo scrive.
export type UpdateBuildProgress = {
    service: string;
    step: number;
    total: number;
    name: string;
};

export type UpdateStatus = {
    state: UpdateStatusState;
    phase: UpdatePhase | null;
    build: UpdateBuildProgress | null;
    currentCommit: string | null;
    // La versione di rilascio installata ("v1.2.0", "v1.2.0 + 3 commit") e quella disponibile
    // ("v1.3.0", null se non c'è un aggiornamento): sono i tag firmati che il server installa. Per
    // un server mai aggiornato a un tag la prima è il commit e la seconda null.
    currentVersion: string | null;
    remoteCommit: string | null;
    remoteVersion: string | null;
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
    phase: null,
    build: null,
    currentCommit: null,
    currentVersion: null,
    remoteCommit: null,
    remoteVersion: null,
    updateAvailable: false,
    lastCheckedAt: null,
    lastUpdateAt: null,
    lastUpdateStatus: null,
    lastError: null,
    log: null,
};

const validStates: UpdateStatusState[] = ["unknown", "idle", "running", "success", "failed"];

const sanitizeBuild = (input: unknown): UpdateBuildProgress | null => {
    const build = input as Partial<UpdateBuildProgress> | null | undefined;

    if (
        typeof build?.service !== "string" ||
        !Number.isInteger(build.step) ||
        !Number.isInteger(build.total) ||
        (build.step as number) < 1 ||
        (build.total as number) < (build.step as number)
    ) {
        return null;
    }

    return {
        service: build.service.slice(0, 40),
        step: build.step as number,
        total: build.total as number,
        name: typeof build.name === "string" ? build.name.slice(0, 80) : "",
    };
};

// Defensive: the host script is the only writer of status.json, so treat its
// contents as untrusted input and fill in sane defaults for anything missing
// or malformed rather than throwing.
const sanitizeStatus = (input: Partial<UpdateStatus> | null | undefined): UpdateStatus => ({
    state: validStates.includes(input?.state as UpdateStatusState) ? (input!.state as UpdateStatusState) : "unknown",
    phase: validPhases.includes(input?.phase as UpdatePhase) ? (input!.phase as UpdatePhase) : null,
    build: sanitizeBuild(input?.build),
    currentCommit: typeof input?.currentCommit === "string" ? input.currentCommit : null,
    currentVersion: typeof input?.currentVersion === "string" ? input.currentVersion : null,
    remoteCommit: typeof input?.remoteCommit === "string" ? input.remoteCommit : null,
    remoteVersion: typeof input?.remoteVersion === "string" ? input.remoteVersion : null,
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

/**
 * Scrive il trigger che l'host raccoglie per avviare l'aggiornamento, senza controlli: chi chiama
 * (`requestUpdate`, lo scheduler degli aggiornamenti programmati) ha gia' verificato che non ce
 * ne sia uno in corso.
 */
export const writeApplyTrigger = () => touchTrigger(applyTriggerPath);

export const requestUpdate = async () => {
    await ensureNotRunning();
    await writeApplyTrigger();
    return getUpdateStatus();
};

export const requestUpdateCheck = async () => {
    await ensureNotRunning();
    await touchTrigger(checkTriggerPath);
    return getUpdateStatus();
};
