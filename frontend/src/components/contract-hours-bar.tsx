import { formatHours, hoursUsageLevel, hoursUsagePercent, type HoursUsageLevel } from "@/lib/contracts";
import { getMonthLabel } from "@/lib/monthKey";
import { cn } from "@/lib/utils";

type ContractHoursBarProps = {
    /** Il mese a cui si riferiscono le ore, "AAAA-MM". */
    month: string;
    usedHours: number;
    /** `null` per il full time: ore illimitate, niente barra. */
    includedHours: number | null;
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
 * Le ore consumate nel mese rispetto a quelle del pacchetto, nella scheda del contratto.
 *
 * Le ore valgono per mese di calendario e non si riportano: la barra riparte da zero il primo del
 * mese. Oltre il 100% la barra resta piena (non può uscire dal suo contenitore) e la quantità in
 * eccesso si dice a parole, in rosso: una barra piena e basta non distinguerebbe "esattamente
 * 10 ore su 10" da "15 ore su 10". Per il full time non c'è un tetto da raggiungere, quindi niente
 * barra: solo "Ore illimitate" e quante se ne sono usate.
 */
const ContractHoursBar = ({ month, usedHours, includedHours, className }: ContractHoursBarProps) => {
    const percent = hoursUsagePercent(usedHours, includedHours);
    const level = hoursUsageLevel(percent);
    const monthLabel = getMonthLabel(month);

    if (includedHours == null || percent == null) {
        return (
            <div className={cn("grid gap-1", className)}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm text-muted-foreground">Ore di {monthLabel}</span>
                    <span className="text-sm font-medium">Ore illimitate</span>
                </div>
                <p className="text-sm text-muted-foreground">Utilizzate nel mese: {formatHours(usedHours)}</p>
            </div>
        );
    }

    const roundedPercent = Math.round(percent);
    const excessHours = usedHours - includedHours;

    return (
        <div className={cn("grid gap-2", className)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm text-muted-foreground">Ore di {monthLabel}</span>
                <span className={cn("text-sm font-semibold", textClassName[level])}>
                    {formatHours(usedHours)} di {formatHours(includedHours)} ({roundedPercent}%)
                </span>
            </div>

            <div
                role="progressbar"
                aria-label={`Ore consumate a ${monthLabel}`}
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
