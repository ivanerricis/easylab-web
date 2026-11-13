import type { AssistancePeriod } from "@/types/dtos";
import { formatHours, hoursUsageLevel, hoursUsagePercent, type HoursUsageLevel } from "@/lib/contracts";
import { getMonthLabel } from "@/lib/monthKey";
import { cn } from "@/lib/utils";

type ContractHoursBarProps = {
    /** `month`: le ore del mese; `contract`: quelle di tutto il contratto (il Supporto). */
    period: AssistancePeriod;
    /** Il mese a cui si riferiscono le ore, "AAAA-MM"; `null` per il periodo `contract`. */
    month: string | null;
    usedHours: number;
    includedHours: number;
    className?: string;
};

/**
 * Lo stesso 80% e 100% con cui il backend avvisa il fornitore: sotto l'80% verde, da lì giallo,
 * dal 100% rosso. I colori sono i token di stato delle liste, non colori nuovi.
 */
const fillClassName: Record<HoursUsageLevel, string> = {
    ok: "bg-status-green",
    warning: "bg-status-yellow",
    exceeded: "bg-status-red",
};

const textClassName: Record<HoursUsageLevel, string> = {
    ok: "text-foreground",
    warning: "text-status-yellow-foreground",
    exceeded: "text-status-red-foreground",
};

/**
 * Le ore consumate rispetto a quelle del pacchetto, nella scheda del contratto.
 *
 * Nei pacchetti mensili le ore valgono per mese di calendario e non si riportano: la barra riparte
 * da zero il primo del mese. Nel Supporto valgono per tutto il contratto e la barra le conta dal
 * primo giorno. Oltre il 100% la barra resta piena (non può uscire dal suo contenitore) e la
 * quantità in eccesso si dice a parole, in rosso: una barra piena e basta non distinguerebbe
 * "esattamente 10 ore su 10" da "15 ore su 10".
 */
const ContractHoursBar = ({ period, month, usedHours, includedHours, className }: ContractHoursBarProps) => {
    const percent = hoursUsagePercent(usedHours, includedHours);
    const level = hoursUsageLevel(percent);
    const monthLabel = period === "month" && month ? getMonthLabel(month) : null;
    const label = monthLabel ? `Ore di ${monthLabel}` : "Ore del contratto";
    const ariaLabel = monthLabel ? `Ore consumate a ${monthLabel}` : "Ore consumate nel contratto";

    if (percent == null) {
        return (
            <div className={cn("grid gap-1", className)}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium">{formatHours(usedHours)} usate</span>
                </div>
            </div>
        );
    }

    const roundedPercent = Math.round(percent);
    const excessHours = usedHours - includedHours;

    return (
        <div className={cn("grid gap-2", className)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={cn("text-sm font-semibold", textClassName[level])}>
                    {formatHours(usedHours)} di {formatHours(includedHours)} ({roundedPercent}%)
                </span>
            </div>

            <div
                role="progressbar"
                aria-label={ariaLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(roundedPercent, 100)}
                aria-valuetext={`${formatHours(usedHours)} su ${formatHours(includedHours)}`}
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
            >
                <div
                    className={cn("h-full rounded-full transition-[width]", fillClassName[level])}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>

            {level === "exceeded" && excessHours > 0 ? (
                <p role="alert" className={cn("text-sm font-medium", textClassName.exceeded)}>
                    Superate di {formatHours(excessHours)} oltre il pacchetto
                </p>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Rimanenti: {formatHours(Math.max(includedHours - usedHours, 0))}
                </p>
            )}
        </div>
    );
};

export default ContractHoursBar;
