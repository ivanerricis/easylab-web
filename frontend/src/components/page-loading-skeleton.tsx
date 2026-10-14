import DetailPageSkeleton from "@/components/detail-page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Quello che la pagina mostra mentre ne arriva il codice (il `Suspense` di `MainLayout`): la
 * forma di una lista (titolo, barra dei filtri, tabella) o di una scheda di dettaglio. Prima era
 * una rotellina sopra un velo, e subito dopo, a codice arrivato, la pagina mostrava i propri
 * scheletri: due indicatori di fila per la stessa attesa. Ora il secondo prende il posto del
 * primo, con la stessa forma, e non cambia niente a schermo.
 */
const PageLoadingSkeleton = ({ variant }: { variant: "list" | "detail" }) => {
    if (variant === "detail") {
        return <DetailPageSkeleton label="Caricamento della pagina" />;
    }

    return (
        <div role="status" aria-busy="true" className="flex w-full flex-col gap-4 self-start">
            <span className="sr-only">Caricamento della pagina</span>
            <div aria-hidden="true" className="flex items-center justify-between gap-4">
                <div className="grid gap-2">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="hidden h-5 w-64 lg:block" />
                </div>
                <Skeleton className="h-9 w-36 max-sm:w-10" />
            </div>
            <div aria-hidden="true" className="flex gap-2">
                <Skeleton className="size-9" />
                <Skeleton className="h-9 w-56 max-sm:flex-1" />
                <Skeleton className="h-9 w-40 max-sm:hidden" />
            </div>
            <div aria-hidden="true" className="grid gap-2">
                <Skeleton className="h-10 w-full" />
                {Array.from({ length: 8 }, (_, row) => (
                    <Skeleton key={row} className="h-12 w-full" />
                ))}
            </div>
        </div>
    );
};

export default PageLoadingSkeleton;
