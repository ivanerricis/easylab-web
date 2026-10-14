import CalendarSkeleton from "@/pages/calendar/components/calendar-skeleton";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
    dashboardCardIconClassName,
    dashboardCardLabelClassName,
    dashboardCardLayoutClassName,
    dashboardCardValueClassName,
} from "./cardDashboard";

/**
 * La dashboard mentre ne arriva il codice: intestazione con i pulsanti, le sei schede e il
 * calendario, nelle stesse posizioni della pagina vera. La griglia e le classi delle schede sono
 * quelle di `DashboardPage` e `cardDashboard`, e le righe di testo dei segnaposto prendono l'altezza
 * dal proprio carattere (`h-[1lh]`), così le schede hanno la stessa altezza di quelle vere a ogni
 * larghezza. Il calendario è lo stesso del `Suspense` della pagina: arrivato il codice, il
 * passaggio dall'uno all'altro non si vede.
 */
const DashboardSkeleton = () => (
    <div role="status" aria-busy="true" className="relative flex min-h-full w-full flex-col gap-4">
        <span className="sr-only">Caricamento della dashboard</span>

        <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-col">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="hidden h-6 w-80 max-w-full lg:block" />
            </div>
            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                <Skeleton className="size-10" />
                <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-10 w-[93px] sm:w-[136px]" />
                    <Skeleton className="h-10 w-[116px] sm:w-[163px]" />
                </div>
            </div>
        </div>

        <div aria-hidden="true" className="@container">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 sm:@max-[80rem]:gap-3 sm:@max-[44rem]:grid-cols-2 @min-[44rem]:grid-cols-3 @min-[80rem]:grid-cols-6 @min-[80rem]:*:min-w-0!">
                {Array.from({ length: 6 }, (_, card) => (
                    <div key={card} className={cn(dashboardCardLayoutClassName, "border bg-card")}>
                        <span className={dashboardCardLabelClassName}>
                            <Skeleton className="h-[1lh] w-20 max-w-full sm:w-32" />
                        </span>
                        <Skeleton className={cn(dashboardCardIconClassName, "rounded-full")} />
                        <span className={dashboardCardValueClassName}>
                            <Skeleton className="h-[1lh] w-10" />
                        </span>
                    </div>
                ))}
            </div>
        </div>

        <Card aria-hidden="true" className="min-h-[24rem] flex-1 sm:min-h-[28rem]">
            <CalendarSkeleton />
        </Card>
    </div>
);

export default DashboardSkeleton;
