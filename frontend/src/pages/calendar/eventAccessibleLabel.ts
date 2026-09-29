import { formatInterventionStatus, formatInterventionType } from "@/lib/interventions";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { InterventionCalendarEvent } from "./hooks/useCalendarInterventions";

/**
 * Il nome che uno screen reader legge sull'evento: cliente, tipo, giorno, orario e stato. Nella
 * griglia lo stato è solo il colore del riquadro e il giorno è la colonna in cui sta, quindi il
 * titolo visibile ("Mario Rossi · Intervento in sede") da solo non bastava.
 */
export const getEventAccessibleLabel = (event: InterventionCalendarEvent) => {
    const intervention = event.resource;
    const day = format(event.start, "EEEE d MMMM", { locale: it });
    const time = event.allDay
        ? "senza orario"
        : `dalle ${format(event.start, "HH:mm")} alle ${format(event.end, "HH:mm")}`;

    return [
        intervention.customer,
        formatInterventionType(intervention.type),
        `${day} ${time}`,
        formatInterventionStatus(intervention.status),
    ].join(", ");
};
