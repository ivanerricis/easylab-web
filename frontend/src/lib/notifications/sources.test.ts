import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listInterventions = vi.fn();
const listNotifications = vi.fn();
const dismissNotification = vi.fn();

vi.mock("@/lib/api", () => ({
    listInterventions: (...args: unknown[]) => listInterventions(...args),
    listNotifications: (...args: unknown[]) => listNotifications(...args),
    dismissNotification: (...args: unknown[]) => dismissNotification(...args),
}));

import { notificationSources } from "./index";
import { interventionsNotificationSource } from "./interventionsSource";
import { serverNotificationSource } from "./serverSource";

const buildIntervention = (id: number, startTime: string | null, status = "programmato") => ({
    id,
    customer: `Cliente ${id}`,
    startTime,
    status,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11, 8, 0));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("notificationSources", () => {
    it("mostra prima gli avvisi di sistema e poi i promemoria", () => {
        expect(notificationSources.map((source) => source.key)).toEqual(["server", "interventions"]);
    });
});

describe("interventionsNotificationSource", () => {
    it("chiede gli interventi programmati per oggi", async () => {
        listInterventions.mockResolvedValue({ items: [] });

        await interventionsNotificationSource.load();

        expect(listInterventions).toHaveBeenCalledWith({ page: 1, pageSize: 100, scheduledDate: "2026-09-11" });
    });

    it("li ordina per orario, con quelli senza orario in fondo", async () => {
        listInterventions.mockResolvedValue({
            items: [
                buildIntervention(1, null),
                buildIntervention(2, "14:00:00"),
                buildIntervention(3, "09:30:00"),
                buildIntervention(4, null),
            ],
        });

        const notifications = await interventionsNotificationSource.load();

        expect(notifications.map((notification) => notification.title)).toEqual([
            "Cliente 3",
            "Cliente 2",
            "Cliente 1",
            "Cliente 4",
        ]);
        expect(notifications[0].meta).toBe("09:30");
        expect(notifications[2].meta).toBeUndefined();
    });

    /**
     * La data nell'id fa sì che chiudere oggi l'avviso di un intervento non nasconda il
     * promemoria dello stesso intervento se viene rimandato a domani.
     */
    it("include la data nell'id e segna come risolti i completati", async () => {
        listInterventions.mockResolvedValue({
            items: [buildIntervention(5, "10:00:00", "completato"), buildIntervention(6, "11:00:00", "in_lavorazione")],
        });

        const [completed, inProgress] = await interventionsNotificationSource.load();

        expect(completed).toMatchObject({
            id: "intervention-2026-09-11-5",
            href: "/interventions/5",
            description: "Completato",
            resolved: true,
        });
        expect(inProgress.resolved).toBe(false);
        expect(inProgress.description).toBe("In lavorazione");
    });
});

describe("serverNotificationSource", () => {
    it("trasforma gli avvisi del backend in voci del menu", async () => {
        listNotifications.mockResolvedValue([
            {
                id: 3,
                severity: "warning",
                title: "Backup fallito",
                message: "Share non raggiungibile",
                link: "/settings",
                occurrences: 1,
                lastOccurredAt: new Date(2026, 8, 10, 21, 0).toISOString(),
            },
            {
                id: 4,
                severity: "info",
                title: "Aggiornamento",
                message: null,
                link: null,
                occurrences: 3,
                lastOccurredAt: new Date(2026, 8, 10, 22, 15).toISOString(),
            },
        ]);

        const [warning, info] = await serverNotificationSource.load();

        expect(warning).toEqual({
            id: "3",
            title: "Backup fallito",
            description: "Share non raggiungibile",
            meta: "10/09/2026, 21:00",
            tone: "warning",
            href: "/settings",
        });
        // Un evento ripetuto resta una voce sola, con il numero di occorrenze.
        expect(info.meta).toBe("10/09/2026, 22:15 · 3×");
        expect(info.tone).toBe("default");
        expect(info.description).toBeUndefined();
        expect(info.href).toBeUndefined();
    });

    it("delega la chiusura al server con l'id numerico", async () => {
        dismissNotification.mockResolvedValue(undefined);

        await serverNotificationSource.dismiss?.("3");

        expect(dismissNotification).toHaveBeenCalledWith(3);
    });
});
