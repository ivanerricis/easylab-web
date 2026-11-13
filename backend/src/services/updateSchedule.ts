import { ApiError } from "./apiError";
import { sendAlertEmail } from "./alertEmail";
import { isDumpInProgress } from "./backupLock";
import { getCompanySettings } from "./companyManager";
import { createJsonSettingsStore } from "./jsonSettingsStore";
import { recordNotification } from "./notificationManager";
import { getUpdateStatus, requestUpdate, writeApplyTrigger, type UpdateStatus } from "./updateManager";

/**
 * Aggiornamenti programmati ("aggiorna alle 03:00").
 *
 * Il backend non esegue nulla sull'host: all'ora fissata scrive lo stesso trigger di "Aggiorna
 * adesso", che l'unita' systemd raccoglie (vedi `updateManager.ts`). La programmazione sta in
 * `data/update-schedule.json`, nel volume che sopravvive alla ricostruzione dei container.
 *
 * Punto delicato: l'aggiornamento *riavvia questo stesso backend*. Per questo, all'ora fissata,
 * lo stato "partito" (`scheduledAt = null`, `triggeredAt = adesso`) viene salvato PRIMA di
 * scrivere il trigger: al riavvio non c'e' piu' nulla da far scattare, quindi non puo' partire
 * due volte. Se il trigger non si scrive, la programmazione non resta in sospeso: si chiude come
 * fallita e l'admin la ripianifica a mano.
 */

export class UpdateScheduleError extends ApiError {}

export type UpdateScheduleOutcome = "success" | "failed" | "cancelled";

type UpdateScheduleState = {
    /** L'istante programmato, ISO UTC. */
    scheduledAt: string | null;
    scheduledBy: string | null;
    /** Quando lo scheduler ha scritto il trigger e sta aspettando l'esito dall'host. */
    triggeredAt: string | null;
    lastOutcome: UpdateScheduleOutcome | null;
    lastOutcomeAt: string | null;
    lastOutcomeMessage: string | null;
};

/** Cio' che esce verso l'interfaccia: `triggeredAt` e' un dettaglio interno dello scheduler. */
export type UpdateSchedulePublic = Omit<UpdateScheduleState, "triggeredAt">;

const minLeadMs = 2 * 60 * 1000;
const maxLeadMs = 30 * 24 * 60 * 60 * 1000;
// Oltre questo ritardo (backend spento all'ora fissata) la programmazione non e' piu' quella che
// l'admin voleva: si annulla e si avvisa, invece di aggiornare in un momento imprevisto.
const maxLateMs = 60 * 60 * 1000;
// Dopo il trigger lo stato sull'host dovrebbe muoversi entro un minuto o due: se in mezz'ora non
// si e' mosso, l'updater sulla VM non e' installato o e' fermo.
const updaterTimeoutMs = 30 * 60 * 1000;
const tickMs = 60 * 1000;

const outcomes: UpdateScheduleOutcome[] = ["success", "failed", "cancelled"];

const defaultState: UpdateScheduleState = {
    scheduledAt: null,
    scheduledBy: null,
    triggeredAt: null,
    lastOutcome: null,
    lastOutcomeAt: null,
    lastOutcomeMessage: null,
};

const validIso = (value: unknown): string | null =>
    typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : null;

const sanitize = (input: Partial<UpdateScheduleState>): UpdateScheduleState => {
    const scheduledAt = validIso(input.scheduledAt);

    return {
        scheduledAt,
        scheduledBy: scheduledAt && typeof input.scheduledBy === "string" ? input.scheduledBy.slice(0, 100) : null,
        triggeredAt: validIso(input.triggeredAt),
        lastOutcome: outcomes.includes(input.lastOutcome as UpdateScheduleOutcome)
            ? (input.lastOutcome as UpdateScheduleOutcome)
            : null,
        lastOutcomeAt: validIso(input.lastOutcomeAt),
        lastOutcomeMessage:
            typeof input.lastOutcomeMessage === "string" ? input.lastOutcomeMessage.slice(0, 500) : null,
    };
};

const store = createJsonSettingsStore<UpdateScheduleState>({
    fileName: "update-schedule.json",
    defaults: defaultState,
    sanitize,
    // Il file nasce alla prima programmazione, non a ogni installazione.
    persistDefaults: false,
});

const toPublic = ({ triggeredAt: _triggeredAt, ...rest }: UpdateScheduleState): UpdateSchedulePublic => rest;

// Le modifiche alla programmazione (admin, scheduler) si fanno una alla volta: lo scheduler legge,
// salva e scrive il trigger senza che una PUT arrivata nel mezzo possa essere sovrascritta.
let queue: Promise<unknown> = Promise.resolve();

const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
};

export const getUpdateSchedule = async (): Promise<UpdateSchedulePublic> => toPublic(await store.load());

/** Solo l'istante programmato: e' tutto cio' che deve sapere chi non e' amministratore. */
export const getScheduledAt = async (): Promise<string | null> => (await store.load()).scheduledAt;

/**
 * Compone data e ora come ora locale del laboratorio. `process.env.TZ` e' gia' il suo fuso
 * (`companyManager`), come per gli orari del backup. Un'ora inesistente (il salto dell'ora legale)
 * verrebbe spostata in silenzio da `Date`: ricomponendola si vede che non coincide.
 */
const parseLocalInstant = (date: string, time: string): Date => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);

    if (!dateMatch || !timeMatch) {
        throw new UpdateScheduleError("Data o ora non valide", 400);
    }

    const [year, month, day] = dateMatch.slice(1).map(Number);
    const [hours, minutes] = timeMatch.slice(1).map(Number);
    const instant = new Date(year, month - 1, day, hours, minutes);

    if (
        instant.getFullYear() !== year ||
        instant.getMonth() !== month - 1 ||
        instant.getDate() !== day ||
        instant.getHours() !== hours ||
        instant.getMinutes() !== minutes
    ) {
        throw new UpdateScheduleError("Quell'ora non esiste (cambio dell'ora legale): scegli un altro orario", 400);
    }

    return instant;
};

export const scheduleUpdate = (
    { date, time }: { date: string; time: string },
    username: string,
    now: Date = new Date()
): Promise<UpdateSchedulePublic> =>
    serialized(async () => {
        const instant = parseLocalInstant(date, time);
        const lead = instant.getTime() - now.getTime();

        if (lead < minLeadMs) {
            throw new UpdateScheduleError("Scegli un orario futuro, ad almeno qualche minuto da adesso", 400);
        }

        if (lead > maxLeadMs) {
            throw new UpdateScheduleError("Puoi programmare un aggiornamento al massimo entro 30 giorni", 400);
        }

        const status = await getUpdateStatus();

        if (status.state === "running") {
            throw new UpdateScheduleError("Un aggiornamento è già in corso", 409);
        }

        if (!status.updateAvailable) {
            throw new UpdateScheduleError("Non ci sono aggiornamenti da programmare", 409);
        }

        // Sostituisce l'eventuale programmazione precedente: e' cosi' che la si modifica.
        const next: UpdateScheduleState = {
            ...(await store.load()),
            scheduledAt: instant.toISOString(),
            scheduledBy: username,
        };
        await store.save(next);

        return toPublic(next);
    });

export const cancelScheduledUpdate = (): Promise<UpdateSchedulePublic> =>
    serialized(async () => {
        const current = await store.load();

        if (!current.scheduledAt) {
            return toPublic(current);
        }

        // Annullata a mano dall'admin: lo sa gia', quindi niente esito da mostrare.
        const next: UpdateScheduleState = { ...current, scheduledAt: null, scheduledBy: null };
        await store.save(next);

        return toPublic(next);
    });

/**
 * "Aggiorna adesso": l'aggiornamento parte subito e la programmazione, se c'era, decade. Il
 * coordinamento sta qui e non in `requestUpdate` per non far importare `updateSchedule` da
 * `updateManager` (che qui e' gia' importato).
 */
export const runUpdateNow = async (): Promise<UpdateStatus> => {
    const status = await requestUpdate();

    try {
        await cancelScheduledUpdate();
    } catch (error) {
        console.error("Impossibile annullare l'aggiornamento programmato:", error);
    }

    return status;
};

// ---------------------------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------------------------

const reportLink = "/settings?section=update";

// L'invio non deve mai far fallire lo scheduler: se non riesce (SMTP giu', ...) l'errore resta nei
// log, la notifica in app e' gia' registrata. Mai atteso dentro la sezione serializzata.
const sendFailureEmail = async (title: string, message: string) => {
    try {
        const company = await getCompanySettings();

        await sendAlertEmail({ subject: `${title} - ${company.name}`, text: `${title}\n\n${message}` });
    } catch (error) {
        console.error("Invio email di avviso aggiornamento non riuscito:", error);
    }
};

const finish = async (
    state: UpdateScheduleState,
    outcome: UpdateScheduleOutcome,
    message: string,
    now: Date,
    dedupeSuffix: string
) => {
    const next: UpdateScheduleState = {
        ...state,
        triggeredAt: null,
        lastOutcome: outcome,
        lastOutcomeAt: now.toISOString(),
        lastOutcomeMessage: message,
    };

    // Prima lo stato: se la notifica fallisce non la si ripete a ogni tick.
    await store.save(next);

    const title =
        outcome === "success"
            ? "Aggiornamento programmato completato"
            : outcome === "cancelled"
              ? "Aggiornamento programmato annullato"
              : "Aggiornamento programmato non riuscito";

    await recordNotification({
        dedupeKey: `update-schedule-${outcome}-${dedupeSuffix}`,
        title,
        message,
        link: reportLink,
        severity: outcome === "success" ? "info" : "warning",
    });

    if (outcome !== "success") {
        void sendFailureEmail(title, message);
    }
};

const parseTime = (value: string | null): number | null => {
    const time = value ? new Date(value).getTime() : NaN;

    return Number.isNaN(time) ? null : time;
};

/** Se il trigger e' partito, guarda se l'host ha finito (o se non si e' mai mosso). */
const checkOutcome = async (state: UpdateScheduleState, status: UpdateStatus, now: Date) => {
    const triggeredAt = parseTime(state.triggeredAt);

    if (triggeredAt === null || status.state === "running") {
        return;
    }

    const finishedAt = parseTime(status.lastUpdateAt);
    // Lo script scrive `lastUpdateAt` al secondo (`date -u +%Y-%m-%dT%H:%M:%SZ`), il trigger ha i
    // millisecondi: un fallimento immediato nello stesso secondo risulterebbe "prima" del trigger
    // e passerebbe per un updater che non risponde.
    const triggeredAtSecond = Math.floor(triggeredAt / 1000) * 1000;

    if (finishedAt !== null && finishedAt >= triggeredAtSecond) {
        if (status.lastUpdateStatus === "success") {
            await finish(
                state,
                "success",
                status.currentVersion
                    ? `Il server è stato aggiornato alla versione ${status.currentVersion}.`
                    : "Il server è stato aggiornato.",
                now,
                state.triggeredAt!
            );
        } else {
            await finish(
                state,
                "failed",
                `L'aggiornamento non è riuscito${status.lastError ? `: ${status.lastError}` : "."}`,
                now,
                state.triggeredAt!
            );
        }

        return;
    }

    if (now.getTime() - triggeredAt > updaterTimeoutMs) {
        await finish(
            state,
            "failed",
            "L'updater sulla VM non ha risposto: l'aggiornamento programmato non è partito. Controlla che il servizio di aggiornamento sia installato.",
            now,
            state.triggeredAt!
        );
    }
};

const startScheduled = async (state: UpdateScheduleState, status: UpdateStatus, now: Date) => {
    const scheduledAt = parseTime(state.scheduledAt);

    if (scheduledAt === null || scheduledAt > now.getTime()) {
        return;
    }

    if (now.getTime() - scheduledAt > maxLateMs) {
        await finish(
            { ...state, scheduledAt: null, scheduledBy: null },
            "cancelled",
            "L'aggiornamento programmato è stato annullato perché il server non era attivo all'ora fissata (più di un'ora di ritardo). Programmalo di nuovo.",
            now,
            state.scheduledAt!
        );

        return;
    }

    // Rimandato al tick dopo (sempre entro l'ora): il backup notturno e un altro aggiornamento
    // non vanno interrotti.
    if (status.state === "running" || isDumpInProgress()) {
        return;
    }

    // L'ordine e' obbligatorio: vedi il commento in testa al file.
    const triggered: UpdateScheduleState = {
        ...state,
        scheduledAt: null,
        scheduledBy: null,
        triggeredAt: now.toISOString(),
    };
    await store.save(triggered);

    try {
        await writeApplyTrigger();
    } catch (error) {
        console.error("Impossibile avviare l'aggiornamento programmato:", error);
        await finish(
            triggered,
            "failed",
            "Non è stato possibile avviare l'aggiornamento programmato. Riprova dalle impostazioni.",
            now,
            triggered.triggeredAt!
        );
    }
};

/** Un giro dello scheduler. Esportato per i test, che passano `now`. */
export const runUpdateSchedulerTick = (now: Date = new Date()): Promise<void> =>
    serialized(async () => {
        const state = await store.load();

        if (!state.scheduledAt && !state.triggeredAt) {
            return;
        }

        const status = await getUpdateStatus();

        if (state.triggeredAt) {
            await checkOutcome(state, status, now);
            return;
        }

        await startScheduled(state, status, now);
    });

let schedulerTimer: NodeJS.Timeout | null = null;

export const startUpdateScheduler = () => {
    if (schedulerTimer) {
        return;
    }

    schedulerTimer = setInterval(() => {
        runUpdateSchedulerTick().catch((error) => console.error("Errore scheduler aggiornamenti:", error));
    }, tickMs);

    schedulerTimer.unref();
};

export const stopUpdateScheduler = () => {
    if (!schedulerTimer) {
        return;
    }

    clearInterval(schedulerTimer);
    schedulerTimer = null;
};
