import { CalendarClock } from "lucide-react";
import { formatScheduledMoment } from "@/lib/updateSchedule";

/**
 * L'avviso, sotto l'intestazione e per tutti, che un aggiornamento è in programma: durante
 * l'aggiornamento i container si ricostruiscono e l'app non risponde per qualche minuto.
 * Discreto (una riga, tinta come gli altri avvisi gialli) e non chiudibile: sparisce da solo
 * quando la programmazione viene annullata o l'aggiornamento parte.
 */
const UpdateScheduleBanner = ({ scheduledAt }: { scheduledAt: string }) => (
    <div
        role="status"
        className="flex items-start gap-2 border-b border-status-yellow/40 bg-status-yellow/10 px-3 py-1.5 text-sm"
    >
        <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
            Aggiornamento programmato per {formatScheduledMoment(scheduledAt)}: l&apos;app sarà ferma per qualche
            minuto.
        </p>
    </div>
);

export default UpdateScheduleBanner;
