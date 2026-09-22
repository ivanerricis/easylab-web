import { listInterventions } from "@/lib/api";
import { entityPaths } from "@/lib/entityPaths";
import { formatInterventionStatus, formatInterventionTime, getTodayDateString } from "@/lib/interventions";
import type { AppNotification, NotificationSource } from "./types";
import type { InterventionDto } from "@/types/dtos";

const byStartTime = (a: InterventionDto, b: InterventionDto) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
};

export const interventionsNotificationSource: NotificationSource = {
    key: "interventions",
    label: "Interventi di oggi",
    emptyLabel: "Nessun intervento in programma per oggi.",
    load: async (): Promise<AppNotification[]> => {
        const today = getTodayDateString();
        const response = await listInterventions({ page: 1, pageSize: 100, scheduledDate: today });

        return response.items
            .slice()
            .sort(byStartTime)
            .map((intervention) => ({
                // La data nell'id fa ricomparire domani un intervento chiuso oggi.
                id: `intervention-${today}-${intervention.id}`,
                title: intervention.customer,
                description: formatInterventionStatus(intervention.status),
                meta: intervention.startTime ? formatInterventionTime(intervention.startTime) : undefined,
                href: entityPaths.intervention(intervention.id),
                resolved: intervention.status === "completato",
            }));
    },
};
