import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DetailCardSkeleton = ({ items }: { items: number }) => (
    <Card size="sm" className="border-primary/15 shadow-sm">
        <CardContent className="grid gap-4">
            <Skeleton aria-hidden="true" className="h-5 w-32" />
            <div aria-hidden="true" className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                {Array.from({ length: items }, (_, item) => (
                    <div key={item} className="grid gap-1.5">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-5 w-3/4" />
                    </div>
                ))}
            </div>
        </CardContent>
    </Card>
);

/**
 * La scheda di dettaglio mentre il record arriva: freccia e titolo, i pulsanti, e due card di
 * voci etichetta/valore. Prima c'era la rotellina a tutta pagina; con la forma della scheda il
 * passaggio ai dati veri non sposta niente, come nelle liste. Lo usa `EntityDetailGate`.
 */
const DetailPageSkeleton = ({ label = "Caricamento in corso" }: { label?: string }) => (
    <div role="status" aria-busy="true" className="flex w-full flex-col gap-4 self-start">
        <span className="sr-only">{label}</span>
        <div aria-hidden="true" className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0" />
            <Skeleton className="h-7 w-56 max-w-full" />
            <div className="ml-auto flex gap-2">
                <Skeleton className="size-9" />
                <Skeleton className="h-9 w-24 max-sm:hidden" />
                <Skeleton className="h-9 w-24 max-sm:hidden" />
            </div>
        </div>
        <DetailCardSkeleton items={6} />
        <DetailCardSkeleton items={4} />
    </div>
);

export default DetailPageSkeleton;
