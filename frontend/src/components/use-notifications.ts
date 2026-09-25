import { useCallback, useEffect, useState } from "react";
import { notificationSources, type AppNotification, type NotificationSource } from "@/lib/notifications";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DISMISSED_STORAGE_KEY = "notifications-dismissed";

/** Voci chiuse dall'utente, raggruppate per sorgente così ognuna può ripulire le proprie. */
type DismissedBySource = Record<string, string[]>;

const readDismissed = (): DismissedBySource => {
    try {
        const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as DismissedBySource) : {};
    } catch {
        return {};
    }
};

const writeDismissed = (dismissed: DismissedBySource) => {
    try {
        window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(dismissed));
    } catch {
        // localStorage non disponibile (navigazione privata, quota, ecc.): la notifica
        // ricompare al prossimo refresh, non è un problema bloccante.
    }
};

// Dimentica le voci chiuse che non esistono più, così l'elenco non cresce all'infinito.
// Si applica solo alle sorgenti che hanno risposto: se una chiamata fallisce le sue voci
// chiuse restano tali invece di ricomparire tutte insieme.
const pruneDismissed = (
    dismissed: DismissedBySource,
    sourceKey: string,
    notifications: AppNotification[]
): DismissedBySource => {
    const current = dismissed[sourceKey] ?? [];
    const existingIds = new Set(notifications.map((notification) => notification.id));
    const kept = current.filter((id) => existingIds.has(id));

    if (kept.length === current.length) {
        return dismissed;
    }

    return { ...dismissed, [sourceKey]: kept };
};

export type NotificationSection = {
    source: NotificationSource;
    notifications: AppNotification[];
};

export const useNotifications = (sources: NotificationSource[] = notificationSources) => {
    const [notificationsBySource, setNotificationsBySource] = useState<Record<string, AppNotification[]>>({});
    const [dismissed, setDismissed] = useState<DismissedBySource>(readDismissed);

    useEffect(() => {
        let cancelled = false;

        const loadSource = async (source: NotificationSource) => {
            try {
                const notifications = await source.load();

                if (cancelled) {
                    return;
                }

                setNotificationsBySource((prev) => ({ ...prev, [source.key]: notifications }));
                setDismissed((prev) => {
                    const next = pruneDismissed(prev, source.key, notifications);

                    if (next !== prev) {
                        writeDismissed(next);
                    }

                    return next;
                });
            } catch {
                // Widget di promemoria: nessun errore a schermo, si ritenta al refresh.
            }
        };

        const refresh = () => {
            for (const source of sources) {
                void loadSource(source);
            }
        };

        refresh();
        const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [sources]);

    const dismiss = useCallback(
        (sourceKey: string, notificationId: string) => {
            const source = sources.find((candidate) => candidate.key === sourceKey);

            if (source?.dismiss) {
                // La chiusura la ricorda il server: qui basta togliere subito la voce dalla
                // lista. Se la chiamata fallisce, la voce ricompare al refresh successivo.
                setNotificationsBySource((prev) => ({
                    ...prev,
                    [sourceKey]: (prev[sourceKey] ?? []).filter((notification) => notification.id !== notificationId),
                }));

                void source.dismiss(notificationId).catch(() => {});
                return;
            }

            setDismissed((prev) => {
                const next = { ...prev, [sourceKey]: [...(prev[sourceKey] ?? []), notificationId] };
                writeDismissed(next);
                return next;
            });
        },
        [sources]
    );

    const sections: NotificationSection[] = sources.map((source) => {
        const dismissedIds = new Set(dismissed[source.key] ?? []);

        return {
            source,
            notifications: (notificationsBySource[source.key] ?? []).filter(
                (notification) => !dismissedIds.has(notification.id)
            ),
        };
    });

    // "Rimuovi tutte": la stessa chiusura della X, voce per voce, così ogni sorgente la gestisce a
    // modo suo (il server per gli avvisi di sistema, il browser per gli interventi di oggi).
    // Con sei o più avvisi prima bisognava chiuderli uno alla volta.
    const dismissAll = () => {
        for (const section of sections) {
            for (const notification of section.notifications) {
                dismiss(section.source.key, notification.id);
            }
        }
    };

    return {
        // Una sezione senza voci compare solo se ha qualcosa da dire al posto dell'elenco.
        sections: sections.filter((section) => section.notifications.length > 0 || section.source.emptyLabel),
        badgeCount: sections.reduce(
            (total, section) => total + section.notifications.filter((notification) => !notification.resolved).length,
            0
        ),
        dismiss,
        dismissAll,
        totalCount: sections.reduce((total, section) => total + section.notifications.length, 0),
    };
};
