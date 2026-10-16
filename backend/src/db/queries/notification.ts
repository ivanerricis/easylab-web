import { and, desc, isNotNull, isNull, lt, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { notificationTable } from "../schema";

type NotificationUpsert = {
    dedupeKey: string;
    severity: string;
    title: string;
    message: string | null;
    link: string | null;
};

/**
 * Un evento gia' presente non crea una seconda riga: aggiorna testo e contatore e torna
 * visibile anche se era stato chiuso, perche' un guasto che si ripete va rivisto.
 */
export const upsertNotification = (data: NotificationUpsert) =>
    db
        .insert(notificationTable)
        .values(data)
        .onConflictDoUpdate({
            target: notificationTable.dedupeKey,
            set: {
                severity: data.severity,
                title: data.title,
                message: data.message,
                link: data.link,
                occurrences: sql`${notificationTable.occurrences} + 1`,
                lastOccurredAt: sql`now()`,
                dismissedAt: null,
                updated_at: sql`now()`,
            },
        })
        .returning();

export const listActiveNotifications = (limit: number) =>
    db
        .select()
        .from(notificationTable)
        .where(isNull(notificationTable.dismissedAt))
        .orderBy(desc(notificationTable.lastOccurredAt))
        .limit(limit);

export const dismissNotificationById = (id: number) =>
    db
        .update(notificationTable)
        .set({ dismissedAt: sql`now()`, updated_at: sql`now()` })
        .where(and(eq(notificationTable.id, id), isNull(notificationTable.dismissedAt)))
        .returning();

export const deleteNotificationsDismissedBefore = (threshold: Date) =>
    db
        .delete(notificationTable)
        .where(and(isNotNull(notificationTable.dismissedAt), lt(notificationTable.dismissedAt, threshold)))
        .returning({ id: notificationTable.id });
