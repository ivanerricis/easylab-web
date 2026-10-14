import DetailPageSkeleton, { detailSkeletonVariantForPath } from "@/components/detail-page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardSkeleton from "@/pages/dashboard/components/dashboard-skeleton";
import SettingsPageSkeleton from "@/pages/settings/settings-skeleton";

/**
 * `full`: due righe di filtri (cerca, selezioni, intervallo di date, colonne), come report e
 * interventi. `filtered`: una riga con ricerca e una selezione, come clienti, collaboratori e
 * tecnici. `simple`: solo aggiorna e ricerca, come dispositivi e difetti.
 */
type ListSkeletonKind = "full" | "filtered" | "simple";

const listSkeletonKindForPath = (pathname: string): ListSkeletonKind => {
    if (/^\/(reports|interventions)$/.test(pathname)) {
        return "full";
    }

    if (/^\/(devices|issues)$/.test(pathname)) {
        return "simple";
    }

    return "filtered";
};

const ListPageSkeleton = ({ kind = "filtered" }: { kind?: ListSkeletonKind }) => (
    <div role="status" aria-busy="true" className="flex w-full flex-col gap-4 self-start">
        <span className="sr-only">Caricamento della pagina</span>
        <div aria-hidden="true" className="flex items-center justify-between gap-4">
            <div className="grid gap-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="hidden h-5 w-64 lg:block" />
            </div>
            <Skeleton className="h-9 w-40 max-sm:w-10" />
        </div>
        <div aria-hidden="true" className="flex flex-wrap gap-2">
            <Skeleton className="size-9" />
            <Skeleton className="h-9 w-60 max-sm:flex-1" />
            {kind === "full" ? (
                <>
                    <Skeleton className="h-9 w-56 max-sm:hidden" />
                    <Skeleton className="h-9 w-56 max-sm:hidden" />
                </>
            ) : null}
            {kind === "filtered" ? <Skeleton className="h-9 w-40 max-sm:hidden" /> : null}
        </div>
        {kind === "full" ? (
            <div aria-hidden="true" className="flex justify-between gap-2 max-sm:hidden">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-40" />
                    <Skeleton className="h-9 w-40" />
                </div>
                <Skeleton className="h-9 w-28" />
            </div>
        ) : null}
        <div aria-hidden="true" className="grid gap-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 8 }, (_, row) => (
                <Skeleton key={row} className="h-12 w-full" />
            ))}
        </div>
    </div>
);

/**
 * Quello che la pagina mostra mentre ne arriva il codice (il `Suspense` di `MainLayout`): lo
 * scheletro della pagina che si sta aprendo, scelto dal percorso, con la stessa forma di quello
 * che la pagina mostrerà da sé mentre aspetta i dati. Prima era una rotellina sopra un velo, e
 * subito dopo la pagina mostrava i propri scheletri: due indicatori di fila per la stessa
 * attesa. Ora il secondo prende il posto del primo, e a schermo non cambia niente.
 */
const PageLoadingSkeleton = ({ pathname }: { pathname: string }) => {
    if (pathname === "/dashboard") {
        return <DashboardSkeleton />;
    }

    if (pathname === "/settings") {
        return <SettingsPageSkeleton />;
    }

    if (/^\/(reports|interventions|clients|collaborators|technicians)\/[^/]+/.test(pathname)) {
        return <DetailPageSkeleton variant={detailSkeletonVariantForPath(pathname)} label="Caricamento della pagina" />;
    }

    return <ListPageSkeleton kind={listSkeletonKindForPath(pathname)} />;
};

export default PageLoadingSkeleton;
