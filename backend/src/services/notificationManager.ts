import {
    deleteNotificationsDismissedBefore,
    dismissNotificationById,
    listActiveNotifications,
    upsertNotification,
} from "../db/queries/notification";
import type { notificationSeverities } from "../db/schema";

type NotificationSeverity = (typeof notificationSeverities)[number];

const maxActiveNotifications = 50;
const dismissedRetentionDays = 30;

export type NotificationInput = {
    /** Stessa chiave = stesso evento: aggiorna la notifica esistente invece di duplicarla. */
    dedupeKey: string;
    title: string;
    message?: string | null;
    link?: string | null;
    severity?: NotificationSeverity;
};

export type NotificationPublic = {
    id: number;
    severity: string;
    title: string;
    message: string | null;
    link: string | null;
    occurrences: number;
    lastOccurredAt: Date;
};

const pruneDismissedNotifications = async () => {
    const threshold = new Date(Date.now() - dismissedRetentionDays * 24 * 60 * 60 * 1000);
    await deleteNotificationsDismissedBefore(threshold);
};

/**
 * Registrare l'avviso non deve mai far fallire l'operazione che lo ha prodotto: un backup
 * riuscito resta riuscito anche se il database rifiuta la notifica. L'errore va nei log.
 */
export const recordNotification = async (input: NotificationInput) => {
    try {
        await upsertNotification({
            dedupeKey: input.dedupeKey,
            severity: input.severity ?? "info",
            title: input.title,
            message: input.message ?? null,
            link: input.link ?? null,
        });

        await pruneDismissedNotifications();
    } catch (error) {
        console.error("Impossibile registrare la notifica:", error);
    }
};

export const getActiveNotifications = async (): Promise<NotificationPublic[]> => {
    const rows = await listActiveNotifications(maxActiveNotifications);

    return rows.map((row) => ({
        id: row.id,
        severity: row.severity,
        title: row.title,
        message: row.message,
        link: row.link,
        occurrences: row.occurrences,
        lastOccurredAt: row.lastOccurredAt,
    }));
};

export const dismissNotification = async (id: number) => {
    await dismissNotificationById(id);
};
