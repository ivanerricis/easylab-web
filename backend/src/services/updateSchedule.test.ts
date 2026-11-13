import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lo scheduler degli aggiornamenti programmati. Il file `data/update-schedule.json` e' finto
 * (una mappa in memoria, riusata tra un "riavvio" e l'altro) cosi' si prova davvero che cosa
 * resta su disco nel momento in cui parte il trigger; `updateManager` e' mockato, quindi nessun
 * trigger reale viene scritto.
 */
process.env.TZ = "Europe/Rome";

const files = new Map<string, string>();

vi.mock("node:fs", () => ({
    default: {
        promises: {
            readFile: async (filePath: string) => {
                const content = files.get(filePath);

                if (content === undefined) {
                    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
                }

                return content;
            },
            writeFile: async (filePath: string, content: string) => {
                files.set(filePath, content);
            },
            mkdir: async () => undefined,
        },
    },
}));

const getUpdateStatus = vi.fn();
const requestUpdate = vi.fn();
const writeApplyTrigger = vi.fn();

vi.mock("./updateManager", () => ({
    getUpdateStatus: () => getUpdateStatus(),
    requestUpdate: () => requestUpdate(),
    writeApplyTrigger: () => writeApplyTrigger(),
}));

const recordNotification = vi.fn();
vi.mock("./notificationManager", () => ({ recordNotification: (input: unknown) => recordNotification(input) }));

const sendAlertEmail = vi.fn();
vi.mock("./alertEmail", () => ({ sendAlertEmail: (input: unknown) => sendAlertEmail(input) }));

vi.mock("./companyManager", () => ({ getCompanySettings: async () => ({ name: "Laboratorio" }) }));

const isDumpInProgress = vi.fn();
vi.mock("./backupLock", () => ({ isDumpInProgress: () => isDumpInProgress() }));

const loadModule = async () => import("./updateSchedule.js");

const baseStatus = {
    state: "idle",
    updateAvailable: true,
    currentVersion: "v1.2.0",
    lastUpdateAt: null,
    lastUpdateStatus: null,
    lastError: null,
};

const storedState = () => {
    const [content] = [...files.values()];

    return content ? (JSON.parse(content) as Record<string, unknown>) : null;
};

// Lunedi' 8 marzo 2027, 12:00 ora di Roma.
const now = new Date(2027, 2, 8, 12, 0);
const at = (hours: number, minutes = 0, days = 0) => new Date(2027, 2, 8 + days, hours, minutes);

const scheduleFilePath = path.join(process.cwd(), "data", "update-schedule.json");

const seedSchedule = (overrides: Record<string, unknown>) => {
    files.set(
        scheduleFilePath,
        JSON.stringify({
            scheduledAt: null,
            scheduledBy: null,
            triggeredAt: null,
            lastOutcome: null,
            lastOutcomeAt: null,
            lastOutcomeMessage: null,
            ...overrides,
        })
    );
};

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    files.clear();
    getUpdateStatus.mockResolvedValue({ ...baseStatus });
    requestUpdate.mockResolvedValue({ ...baseStatus });
    writeApplyTrigger.mockResolvedValue(undefined);
    sendAlertEmail.mockResolvedValue(undefined);
    isDumpInProgress.mockReturnValue(false);
});

describe("scheduleUpdate: validazione", () => {
    it("salva l'istante in UTC partendo dall'ora locale del laboratorio", async () => {
        const { scheduleUpdate } = await loadModule();

        const schedule = await scheduleUpdate({ date: "2027-03-10", time: "03:00" }, "ivan", now);

        // Il 10 marzo l'ora solare vale ancora: Roma e' UTC+1.
        expect(schedule).toMatchObject({ scheduledAt: "2027-03-10T02:00:00.000Z", scheduledBy: "ivan" });
        expect(storedState()).toMatchObject({ scheduledAt: "2027-03-10T02:00:00.000Z" });
    });

    it.each([
        ["data in formato sbagliato", "10/03/2027", "03:00"],
        ["ora in formato sbagliato", "2027-03-10", "3pm"],
        ["data inesistente", "2027-02-30", "03:00"],
        ["ora fuori scala", "2027-03-10", "25:00"],
    ])("rifiuta %s", async (_label, date, time) => {
        const { scheduleUpdate } = await loadModule();

        await expect(scheduleUpdate({ date, time }, "ivan", now)).rejects.toMatchObject({ statusCode: 400 });
        expect(files.size).toBe(0);
    });

    it("rifiuta un orario passato o a meno di due minuti da adesso", async () => {
        const { scheduleUpdate } = await loadModule();

        await expect(scheduleUpdate({ date: "2027-03-08", time: "11:00" }, "ivan", now)).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(scheduleUpdate({ date: "2027-03-08", time: "12:01" }, "ivan", now)).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(scheduleUpdate({ date: "2027-03-08", time: "12:03" }, "ivan", now)).resolves.toBeTruthy();
    });

    it("rifiuta oltre 30 giorni da adesso", async () => {
        const { scheduleUpdate } = await loadModule();

        await expect(scheduleUpdate({ date: "2027-04-08", time: "12:00" }, "ivan", now)).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(scheduleUpdate({ date: "2027-04-06", time: "12:00" }, "ivan", now)).resolves.toBeTruthy();
    });

    // Il 28 marzo 2027 alle 02:00 Roma salta alle 03:00: le 02:30 non esistono, e `Date` le
    // sposterebbe in silenzio alle 03:30.
    it("rifiuta un'ora inesistente per il cambio all'ora legale", async () => {
        const { scheduleUpdate } = await loadModule();

        await expect(scheduleUpdate({ date: "2027-03-28", time: "02:30" }, "ivan", now)).rejects.toThrow(/ora legale/);
        await expect(scheduleUpdate({ date: "2027-03-28", time: "03:30" }, "ivan", now)).resolves.toBeTruthy();
    });

    it("richiede un aggiornamento disponibile", async () => {
        getUpdateStatus.mockResolvedValue({ ...baseStatus, updateAvailable: false });
        const { scheduleUpdate } = await loadModule();

        await expect(scheduleUpdate({ date: "2027-03-10", time: "03:00" }, "ivan", now)).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("rifiuta mentre un aggiornamento e' in corso", async () => {
        getUpdateStatus.mockResolvedValue({ ...baseStatus, state: "running" });
        const { scheduleUpdate } = await loadModule();

        await expect(scheduleUpdate({ date: "2027-03-10", time: "03:00" }, "ivan", now)).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("programmare di nuovo sostituisce la programmazione, e annullare la toglie", async () => {
        const { scheduleUpdate, cancelScheduledUpdate, getScheduledAt } = await loadModule();

        await scheduleUpdate({ date: "2027-03-10", time: "03:00" }, "ivan", now);
        await scheduleUpdate({ date: "2027-03-11", time: "04:00" }, "tommaso", now);

        expect(await getScheduledAt()).toBe("2027-03-11T03:00:00.000Z");
        expect(storedState()).toMatchObject({ scheduledBy: "tommaso" });

        const cancelled = await cancelScheduledUpdate();

        expect(cancelled.scheduledAt).toBeNull();
        expect(await getScheduledAt()).toBeNull();
    });
});

describe("runUpdateNow", () => {
    it("fa partire l'aggiornamento e annulla la programmazione", async () => {
        const { scheduleUpdate, runUpdateNow, getScheduledAt } = await loadModule();
        await scheduleUpdate({ date: "2027-03-10", time: "03:00" }, "ivan", now);

        await runUpdateNow();

        expect(requestUpdate).toHaveBeenCalledOnce();
        expect(await getScheduledAt()).toBeNull();
    });

    it("se l'aggiornamento non puo' partire (gia' in corso) la programmazione resta", async () => {
        const { scheduleUpdate, runUpdateNow, getScheduledAt } = await loadModule();
        await scheduleUpdate({ date: "2027-03-10", time: "03:00" }, "ivan", now);
        requestUpdate.mockRejectedValue(new Error("Un aggiornamento è già in corso"));

        await expect(runUpdateNow()).rejects.toThrow();

        expect(await getScheduledAt()).not.toBeNull();
    });
});

describe("scheduler: esecuzione", () => {
    const scheduleFor3am = async () => {
        const mod = await loadModule();
        await mod.scheduleUpdate({ date: "2027-03-09", time: "03:00" }, "ivan", now);
        return mod;
    };

    it("non fa nulla prima dell'ora fissata", async () => {
        const { runUpdateSchedulerTick } = await scheduleFor3am();

        await runUpdateSchedulerTick(at(2, 59, 1));

        expect(writeApplyTrigger).not.toHaveBeenCalled();
    });

    it("all'ora fissata salva lo stato PRIMA di scrivere il trigger", async () => {
        const { runUpdateSchedulerTick } = await scheduleFor3am();
        let stateWhenTriggered: Record<string, unknown> | null = null;
        writeApplyTrigger.mockImplementation(async () => {
            stateWhenTriggered = storedState();
        });

        await runUpdateSchedulerTick(at(3, 0, 1));

        expect(writeApplyTrigger).toHaveBeenCalledOnce();
        expect(stateWhenTriggered).toMatchObject({
            scheduledAt: null,
            triggeredAt: at(3, 0, 1).toISOString(),
        });
    });

    // L'aggiornamento riavvia questo backend: al riavvio la programmazione non deve scattare di nuovo.
    it("dopo un riavvio del backend non scatta una seconda volta", async () => {
        const first = await scheduleFor3am();
        await first.runUpdateSchedulerTick(at(3, 0, 1));
        expect(writeApplyTrigger).toHaveBeenCalledOnce();

        vi.resetModules();
        const restarted = await loadModule();
        getUpdateStatus.mockResolvedValue({ ...baseStatus, state: "running" });
        await restarted.runUpdateSchedulerTick(at(3, 1, 1));
        getUpdateStatus.mockResolvedValue({ ...baseStatus });
        await restarted.runUpdateSchedulerTick(at(3, 2, 1));

        expect(writeApplyTrigger).toHaveBeenCalledOnce();
    });

    it("se il trigger non si scrive chiude la programmazione come fallita e avvisa, senza riprovare", async () => {
        const { runUpdateSchedulerTick, getUpdateSchedule } = await scheduleFor3am();
        writeApplyTrigger.mockRejectedValue(new Error("EACCES"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await runUpdateSchedulerTick(at(3, 0, 1));
        await runUpdateSchedulerTick(at(3, 1, 1));

        expect(writeApplyTrigger).toHaveBeenCalledOnce();
        expect(await getUpdateSchedule()).toMatchObject({ scheduledAt: null, lastOutcome: "failed" });
        expect(storedState()).toMatchObject({ triggeredAt: null });
        expect(recordNotification).toHaveBeenCalledOnce();
        expect(sendAlertEmail).toHaveBeenCalledOnce();
    });

    it("con piu' di un'ora di ritardo annulla, avvisa in app e per email, e non aggiorna", async () => {
        const { runUpdateSchedulerTick, getUpdateSchedule } = await scheduleFor3am();

        await runUpdateSchedulerTick(at(4, 1, 1));

        expect(writeApplyTrigger).not.toHaveBeenCalled();
        expect(await getUpdateSchedule()).toMatchObject({ scheduledAt: null, lastOutcome: "cancelled" });
        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({ link: "/settings?section=update", severity: "warning" })
        );
        expect(sendAlertEmail).toHaveBeenCalledOnce();

        await runUpdateSchedulerTick(at(4, 2, 1));
        expect(recordNotification).toHaveBeenCalledOnce();
    });

    it("con meno di un'ora di ritardo parte ancora", async () => {
        const { runUpdateSchedulerTick } = await scheduleFor3am();

        await runUpdateSchedulerTick(at(3, 59, 1));

        expect(writeApplyTrigger).toHaveBeenCalledOnce();
    });

    it("rimanda se il backup notturno e' in corso e riparte al tick dopo", async () => {
        const { runUpdateSchedulerTick, getScheduledAt } = await scheduleFor3am();
        isDumpInProgress.mockReturnValue(true);

        await runUpdateSchedulerTick(at(3, 0, 1));

        expect(writeApplyTrigger).not.toHaveBeenCalled();
        expect(await getScheduledAt()).not.toBeNull();

        isDumpInProgress.mockReturnValue(false);
        await runUpdateSchedulerTick(at(3, 1, 1));

        expect(writeApplyTrigger).toHaveBeenCalledOnce();
    });

    it("rimanda se un aggiornamento e' gia' in corso", async () => {
        const { runUpdateSchedulerTick, getScheduledAt } = await scheduleFor3am();
        getUpdateStatus.mockResolvedValue({ ...baseStatus, state: "running" });

        await runUpdateSchedulerTick(at(3, 0, 1));

        expect(writeApplyTrigger).not.toHaveBeenCalled();
        expect(await getScheduledAt()).not.toBeNull();
    });

    it("un errore nel tick finisce nei log e non ferma il timer", async () => {
        vi.useFakeTimers();
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        seedSchedule({ scheduledAt: at(3, 0, 1).toISOString() });
        getUpdateStatus.mockRejectedValue(new Error("lettura fallita"));
        const { startUpdateScheduler, stopUpdateScheduler } = await loadModule();

        startUpdateScheduler();
        await vi.advanceTimersByTimeAsync(60 * 1000);
        stopUpdateScheduler();
        vi.useRealTimers();

        expect(error).toHaveBeenCalledWith("Errore scheduler aggiornamenti:", expect.any(Error));
    });
});

describe("scheduler: esito", () => {
    const triggered = at(3, 0, 1);

    // Parte da un aggiornamento gia' scattato (come dopo il riavvio del backend).
    const prepare = async () => {
        const mod = await loadModule();
        await mod.scheduleUpdate({ date: "2027-03-09", time: "03:00" }, "ivan", now);
        await mod.runUpdateSchedulerTick(triggered);
        writeApplyTrigger.mockClear();
        return mod;
    };

    it("aspetta finche' l'host sta ancora lavorando", async () => {
        const { runUpdateSchedulerTick } = await prepare();
        getUpdateStatus.mockResolvedValue({ ...baseStatus, state: "running" });

        await runUpdateSchedulerTick(at(3, 5, 1));

        expect(recordNotification).not.toHaveBeenCalled();
    });

    it("notifica il successo una sola volta, senza email", async () => {
        const { runUpdateSchedulerTick, getUpdateSchedule } = await prepare();
        getUpdateStatus.mockResolvedValue({
            ...baseStatus,
            state: "success",
            currentVersion: "v1.3.0",
            lastUpdateAt: at(3, 6, 1).toISOString(),
            lastUpdateStatus: "success",
        });

        await runUpdateSchedulerTick(at(3, 7, 1));
        await runUpdateSchedulerTick(at(3, 8, 1));

        expect(recordNotification).toHaveBeenCalledOnce();
        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({ severity: "info", message: expect.stringContaining("v1.3.0") })
        );
        expect(sendAlertEmail).not.toHaveBeenCalled();
        expect(await getUpdateSchedule()).toMatchObject({ lastOutcome: "success" });
    });

    it("notifica il fallimento una sola volta, con email", async () => {
        const { runUpdateSchedulerTick, getUpdateSchedule } = await prepare();
        getUpdateStatus.mockResolvedValue({
            ...baseStatus,
            state: "failed",
            lastUpdateAt: at(3, 6, 1).toISOString(),
            lastUpdateStatus: "failed",
            lastError: "docker build fallita",
        });

        await runUpdateSchedulerTick(at(3, 7, 1));
        await runUpdateSchedulerTick(at(3, 8, 1));

        expect(recordNotification).toHaveBeenCalledOnce();
        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({ severity: "warning", message: expect.stringContaining("docker build fallita") })
        );
        expect(sendAlertEmail).toHaveBeenCalledOnce();
        expect(await getUpdateSchedule()).toMatchObject({ lastOutcome: "failed" });
    });

    it("l'errore dell'invio email non fa fallire il tick", async () => {
        const { runUpdateSchedulerTick } = await prepare();
        sendAlertEmail.mockRejectedValue(new Error("SMTP giu'"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        getUpdateStatus.mockResolvedValue({
            ...baseStatus,
            lastUpdateAt: at(3, 6, 1).toISOString(),
            lastUpdateStatus: "failed",
        });

        await expect(runUpdateSchedulerTick(at(3, 7, 1))).resolves.toBeUndefined();
    });

    it("un fallimento nello stesso secondo del trigger conta come esito (lo script scrive al secondo)", async () => {
        const mod = await loadModule();
        await mod.scheduleUpdate({ date: "2027-03-09", time: "03:00" }, "ivan", now);
        await mod.runUpdateSchedulerTick(new Date(triggered.getTime() + 700));
        getUpdateStatus.mockResolvedValue({
            ...baseStatus,
            state: "failed",
            lastUpdateAt: triggered.toISOString().replace(/\.\d{3}Z$/, "Z"),
            lastUpdateStatus: "failed",
            lastError: "Manca ops/allowed_signers",
        });

        await mod.runUpdateSchedulerTick(at(3, 2, 1));

        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("allowed_signers") })
        );
    });

    it("un esito vecchio (precedente al trigger) non vale", async () => {
        const { runUpdateSchedulerTick } = await prepare();
        getUpdateStatus.mockResolvedValue({
            ...baseStatus,
            lastUpdateAt: at(1, 0, 0).toISOString(),
            lastUpdateStatus: "success",
        });

        await runUpdateSchedulerTick(at(3, 10, 1));

        expect(recordNotification).not.toHaveBeenCalled();
    });

    it("dopo 30 minuti senza che lo stato si muova avvisa che l'updater non ha risposto", async () => {
        const { runUpdateSchedulerTick } = await prepare();

        await runUpdateSchedulerTick(at(3, 29, 1));
        expect(recordNotification).not.toHaveBeenCalled();

        await runUpdateSchedulerTick(at(3, 31, 1));
        await runUpdateSchedulerTick(at(3, 32, 1));

        expect(recordNotification).toHaveBeenCalledOnce();
        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("non ha risposto") })
        );
        expect(sendAlertEmail).toHaveBeenCalledOnce();
    });

    it("lo scheduler parte e si ferma senza lasciare timer attivi", async () => {
        const { startUpdateScheduler, stopUpdateScheduler } = await loadModule();

        startUpdateScheduler();
        startUpdateScheduler();
        stopUpdateScheduler();
        stopUpdateScheduler();
    });
});

describe("sanitize del file", () => {
    it("ignora valori fuori regola nel file", async () => {
        seedSchedule({ scheduledAt: "non una data", lastOutcome: "boh", scheduledBy: 5, lastOutcomeMessage: 3 });
        const { getUpdateSchedule } = await loadModule();

        expect(await getUpdateSchedule()).toEqual({
            scheduledAt: null,
            scheduledBy: null,
            lastOutcome: null,
            lastOutcomeAt: null,
            lastOutcomeMessage: null,
        });
    });

    it("riparte da una programmazione salvata prima del riavvio", async () => {
        seedSchedule({ scheduledAt: at(3, 0, 1).toISOString(), scheduledBy: "ivan" });
        const { getScheduledAt } = await loadModule();

        expect(await getScheduledAt()).toBe(at(3, 0, 1).toISOString());
    });
});
