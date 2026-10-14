import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = Readonly<{
    className?: string;
    /** Cosa si sta caricando: finisce nell'annuncio dello screen reader. */
    label?: string;
}>;

/**
 * La forma del calendario del mese mentre arriva: barra con frecce e viste, riga dei giorni e
 * cinque righe di celle. Sta al posto della rotellina a tutta area, così quando i dati arrivano
 * il riquadro non cambia aspetto né misura. Lo usano sia l'attesa del codice del calendario
 * (`Suspense` in `DashboardPage`) sia quella delle prime richieste (`InterventionsCalendar`).
 */
const CalendarSkeleton = ({ className, label = "Caricamento del calendario" }: Props) => (
    <div role="status" aria-busy="true" className={cn("flex h-full min-h-0 flex-col gap-3 p-4 max-sm:p-3", className)}>
        <span className="sr-only">{label}</span>
        <div aria-hidden="true" className="flex items-center justify-between gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-9 w-24 max-sm:w-16" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, day) => (
                <Skeleton key={day} className="h-5" />
            ))}
        </div>
        <div aria-hidden="true" className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 gap-1.5">
            {Array.from({ length: 35 }, (_, cell) => (
                <Skeleton key={cell} className="min-h-8 rounded-sm" />
            ))}
        </div>
    </div>
);

export default CalendarSkeleton;
