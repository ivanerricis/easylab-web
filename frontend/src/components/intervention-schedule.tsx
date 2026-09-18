import { formatInterventionTime } from "@/lib/interventions";
import { formatDate } from "@/lib/utils";

type InterventionScheduleProps = {
    interventionDate: string | null;
    startTime: string | null;
    endTime: string | null;
};

/**
 * Data e orario di un intervento: "12/09/2026 09:00-10:30", solo la data se mancano gli orari, "-"
 * senza data. Era scritto uguale in quattro punti: le colonne "Data/Orario" dell'elenco interventi
 * e delle schede di cliente e collaboratore, e il popover del calendario (lì con un "·" in mezzo).
 */
const InterventionSchedule = ({ interventionDate, startTime, endTime }: InterventionScheduleProps) => {
    if (!interventionDate) {
        return "-";
    }

    if (!startTime || !endTime) {
        return formatDate(interventionDate);
    }

    // L'orario resta intero: in mezza scheda su mobile andava a capo sul trattino ("13:00-" /
    // "14:30"). Così a capo va, se serve, fra la data e l'orario.
    return (
        <>
            {formatDate(interventionDate)}{" "}
            <span className="whitespace-nowrap">
                {formatInterventionTime(startTime)}-{formatInterventionTime(endTime)}
            </span>
        </>
    );
};

export default InterventionSchedule;
