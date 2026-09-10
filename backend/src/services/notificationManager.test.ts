import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertNotification = vi.fn();
const listActiveNotifications = vi.fn();
const dismissNotificationById = vi.fn();
const deleteNotificationsDismissedBefore = vi.fn();

vi.mock("../db/queries/notification", () => ({
    upsertNotification: (data: unknown) => upsertNotification(data),
    listActiveNotifications: (limit: number) => listActiveNotifications(limit),
    dismissNotificationById: (id: number) => dismissNotificationById(id),
    deleteNotificationsDismissedBefore: (threshold: Date) => deleteNotificationsDismissedBefore(threshold),
}));

import { dismissNotification, getActiveNotifications, recordNotification } from "./notificationManager";

beforeEach(() => {
    vi.clearAllMocks();
    upsertNotification.mockResolvedValue(undefined);
    deleteNotificationsDismissedBefore.mockResolvedValue(undefined);
});

describe("recordNotification", () => {
    it("passa i default quando severity/message/link non sono forniti", async () => {
        await recordNotification({ dedupeKey: "evento-1", title: "Titolo" });

        expect(upsertNotification).toHaveBeenCalledWith({
            dedupeKey: "evento-1",
            severity: "info",
            title: "Titolo",
            message: null,
            link: null,
        });
    });

    it("passa severity/message/link espliciti senza alterarli", async () => {
        await recordNotification({
            dedupeKey: "evento-2",
            title: "Titolo",
            message: "Dettaglio",
            link: "/pagina",
            severity: "warning",
        });

        expect(upsertNotification).toHaveBeenCalledWith({
            dedupeKey: "evento-2",
            severity: "warning",
            title: "Titolo",
            message: "Dettaglio",
            link: "/pagina",
        });
    });

    /**
     * La deduplicazione non è una guardia in JS: `recordNotification` chiama sempre
     * `upsertNotification`, ed è il vincolo unico su `dedupeKey` (onConflictDoUpdate, che
     * incrementa `occurrences` invece di duplicare la riga) a fare il lavoro lato database.
     * Qui si verifica solo che la stessa chiave passi due volte, invariata.
     */
    it("due chiamate con la stessa dedupeKey producono due upsert, non un unico insert bloccato", async () => {
        await recordNotification({ dedupeKey: "evento-ripetuto", title: "Prima" });
        await recordNotification({ dedupeKey: "evento-ripetuto", title: "Seconda" });

        expect(upsertNotification).toHaveBeenCalledTimes(2);
        expect(upsertNotification).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ dedupeKey: "evento-ripetuto" })
        );
        expect(upsertNotification).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ dedupeKey: "evento-ripetuto" })
        );
    });

    it("pota le notifiche chiuse da più di 30 giorni dopo aver registrato", async () => {
        const prima = Date.now();
        await recordNotification({ dedupeKey: "evento-3", title: "Titolo" });
        const dopo = Date.now();

        expect(deleteNotificationsDismissedBefore).toHaveBeenCalledTimes(1);
        const soglia = deleteNotificationsDismissedBefore.mock.calls[0][0] as Date;
        const trentaGiorniMs = 30 * 24 * 60 * 60 * 1000;

        expect(soglia.getTime()).toBeGreaterThanOrEqual(prima - trentaGiorniMs - 1000);
        expect(soglia.getTime()).toBeLessThanOrEqual(dopo - trentaGiorniMs + 1000);
    });

    /**
     * Chi chiama recordNotification (es. un backup riuscito) non deve fallire perché la
     * notifica non si registra: l'errore va solo nei log.
     */
    it("non propaga l'errore se upsertNotification fallisce", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        upsertNotification.mockRejectedValue(new Error("database giù"));

        await expect(recordNotification({ dedupeKey: "evento-4", title: "Titolo" })).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe("getActiveNotifications", () => {
    it("interroga con il limite massimo e proietta solo i campi pubblici", async () => {
        const lastOccurredAt = new Date("2026-02-01T00:00:00Z");
        listActiveNotifications.mockResolvedValue([
            {
                id: 1,
                dedupeKey: "chiave-interna",
                severity: "warning",
                title: "Titolo",
                message: "Msg",
                link: "/x",
                occurrences: 3,
                lastOccurredAt,
                dismissedAt: null,
                created_at: new Date(),
                updated_at: null,
            },
        ]);

        const result = await getActiveNotifications();

        expect(listActiveNotifications).toHaveBeenCalledWith(50);
        expect(result).toEqual([
            {
                id: 1,
                severity: "warning",
                title: "Titolo",
                message: "Msg",
                link: "/x",
                occurrences: 3,
                lastOccurredAt,
            },
        ]);
    });

    it("nessuna notifica attiva: lista vuota", async () => {
        listActiveNotifications.mockResolvedValue([]);

        await expect(getActiveNotifications()).resolves.toEqual([]);
    });
});

describe("dismissNotification", () => {
    it("inoltra l'id alla query di chiusura", async () => {
        dismissNotificationById.mockResolvedValue(undefined);

        await dismissNotification(42);

        expect(dismissNotificationById).toHaveBeenCalledWith(42);
    });
});
