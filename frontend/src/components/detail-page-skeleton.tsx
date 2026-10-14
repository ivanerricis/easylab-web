import { DetailGrid, DetailSection } from "@/components/detail-item";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Le tre forme delle schede di dettaglio: `report` e `intervention` hanno la riga dei numeri
 * (`DetailStats`) e le sezioni a righe; `person` (cliente, collaboratore, tecnico) ha una card di
 * dati e sotto la tabella dei report/interventi.
 */
export type DetailSkeletonVariant = "report" | "intervention" | "person";

/**
 * La forma di scheda che spetta a un indirizzo, per chi mostra lo scheletro prima ancora che la
 * pagina esista (il `Suspense` di `MainLayout`). Lo stesso `variant` che la pagina passa poi a
 * `EntityDetailGate`: i due scheletri restano uguali e il passaggio non sposta niente.
 */
const detailSkeletonVariantForPath = (pathname: string): DetailSkeletonVariant => {
    if (/^\/reports\/[^/]+/.test(pathname)) {
        return "report";
    }

    if (/^\/interventions\/[^/]+/.test(pathname)) {
        return "intervention";
    }

    return "person";
};

/**
 * I pulsanti dell'intestazione per forma: quelli con la scritta da `lg` in su sono più larghi
 * (Modifica, Stampa, Email), gli altri restano un'icona di 40px (Aggiorna, Elimina).
 */
const headerActions: Record<DetailSkeletonVariant, boolean[]> = {
    report: [false, true, true, false],
    intervention: [false, true, true, true, false],
    person: [false, true, true, false],
};

/** Il titolo di una sezione: una riga alta quanto il `CardTitle` (24px). */
const SectionTitleSkeleton = ({ className }: { className?: string }) => (
    <Skeleton className={cn("my-1 h-4 w-32", className)} />
);

/** Una riga di `DetailGrid layout="rows"`: stesse classi di `DetailItem`, con barre al posto del testo. */
const RowSkeleton = ({ className }: { className?: string }) => (
    <div className={cn("flex min-w-0 items-center justify-between gap-4 border-b border-border py-2.5", className)}>
        <Skeleton className="my-[3px] h-3.5 w-24" />
        <Skeleton className="my-[3px] h-3.5 w-32" />
    </div>
);

const RowsSectionSkeleton = ({
    rows,
    className,
    gridClassName,
    title,
}: {
    rows: number;
    className?: string;
    gridClassName?: string;
    title?: ReactNode;
}) => (
    <DetailSection
        title={<div aria-hidden="true">{title ?? <SectionTitleSkeleton />}</div>}
        titleAs="div"
        className={className}
    >
        <div aria-hidden="true">
            <DetailGrid layout="rows" className={gridClassName}>
                {Array.from({ length: rows }, (_, row) => (
                    <RowSkeleton key={row} />
                ))}
            </DetailGrid>
        </div>
    </DetailSection>
);

/**
 * Freccia, titolo e pulsanti: la stessa riga di `DetailHeader`. Il titolo sotto `sm` manca (lo
 * ospita la prima card, vedi `hideTitleOnMobile`), come nella pagina vera.
 */
const HeaderSkeleton = ({ variant }: { variant: DetailSkeletonVariant }) => (
    <div aria-hidden="true" className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="flex min-w-0 flex-auto items-center gap-2">
            <Skeleton className="-ml-2 size-10 shrink-0" />
            <Skeleton className="h-7 w-56 max-w-full max-sm:hidden" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
            {headerActions[variant].map((wide, index) => (
                <Skeleton key={index} className={cn("size-10", wide && "lg:w-28")} />
            ))}
        </div>
    </div>
);

/** I cinque numeri in cima: la stessa markup di `DetailStats` (righe sotto `xl`, card da `xl`). */
const StatsSkeleton = () => (
    <div
        aria-hidden="true"
        className="rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10 xl:rounded-none xl:bg-transparent xl:shadow-none xl:ring-0"
    >
        {/* Il titolo della scheda, solo su telefono: nella pagina vera sostituisce quello dell'intestazione. */}
        <div className="px-6 pt-3.5 pb-1 sm:hidden">
            <Skeleton className="my-1 h-5 w-48 max-w-full" />
        </div>
        <div className="divide-y divide-border xl:grid xl:grid-cols-5 xl:gap-4 xl:divide-y-0">
            {Array.from({ length: 5 }, (_, item) => (
                <div
                    key={item}
                    className="flex min-w-0 items-center justify-between gap-3 px-6 py-2.5 xl:flex-col xl:items-start xl:justify-start xl:gap-2 xl:rounded-xl xl:bg-card xl:px-6 xl:py-5 xl:shadow-xs xl:ring-1 xl:ring-foreground/10"
                >
                    <Skeleton className="my-[3px] h-3.5 w-20" />
                    <Skeleton className="my-[3px] h-3.5 w-24 xl:my-2 xl:h-5 xl:w-28" />
                </div>
            ))}
        </div>
    </div>
);

/** Le sezioni della scheda report: due coppie affiancate da `xl`, in colonna sotto. */
const ReportBodySkeleton = () => (
    <>
        <div className="grid gap-4 xl:grid-cols-2">
            <RowsSectionSkeleton rows={5} />
            <RowsSectionSkeleton rows={6} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
            <RowsSectionSkeleton rows={4} />
            <RowsSectionSkeleton rows={2} className="self-start" />
        </div>
    </>
);

/** Le sezioni della scheda intervento: anagrafica corta e "Dettagli" lunga, affiancate da `xl`. */
const InterventionBodySkeleton = () => (
    <div className="grid gap-4 xl:grid-cols-2">
        <RowsSectionSkeleton rows={3} className="self-start" />
        <RowsSectionSkeleton rows={8} />
    </div>
);

/**
 * La card dei dati di cliente, collaboratore e tecnico e la tabella sotto: tab (o titolo) e filtro
 * sulla stessa riga, tabella da `sm`, schede su telefono, impaginazione in fondo.
 */
const PersonBodySkeleton = () => (
    <>
        <DetailSection
            title={
                <div aria-hidden="true" className="max-sm:flex max-sm:h-10 max-sm:items-center">
                    <SectionTitleSkeleton className="sm:w-40" />
                </div>
            }
            titleAs="div"
        >
            <div aria-hidden="true">
                <DetailGrid layout="rows" className="sm:grid-cols-2 xl:grid-cols-3">
                    <RowSkeleton />
                    <RowSkeleton className="max-sm:hidden" />
                    <RowSkeleton className="max-sm:hidden" />
                    <RowSkeleton className="max-sm:hidden" />
                    <RowSkeleton className="max-sm:hidden" />
                </DetailGrid>
            </div>
        </DetailSection>

        <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-10 w-44" />
                <Skeleton className="h-10 w-40 max-sm:w-32" />
            </div>
            {/* Taglia le righe che non stanno: l'impaginazione resta in fondo, come nella pagina vera. */}
            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="grid gap-px max-sm:hidden">
                    <Skeleton className="h-10 w-full" />
                    {Array.from({ length: 10 }, (_, row) => (
                        <Skeleton key={row} className="h-14 w-full" />
                    ))}
                </div>
                <div className="grid gap-3 sm:hidden">
                    {Array.from({ length: 3 }, (_, card) => (
                        <Skeleton key={card} className="h-56 w-full rounded-xl" />
                    ))}
                </div>
            </div>
            <Skeleton className="h-10 w-full" />
        </div>
    </>
);

/**
 * La scheda di dettaglio mentre il record arriva, con la forma di quella vera (vedi
 * `DetailSkeletonVariant`): intestazione, e sotto le stesse card a righe, con gli stessi
 * contenitori e gli stessi gap, così il passaggio ai dati non sposta niente. Prima era una forma
 * sola per tutte e cinque le schede. Lo usano `EntityDetailGate` e, per il codice ancora in
 * arrivo, `PageLoadingSkeleton`.
 */
const DetailPageSkeleton = ({
    label = "Caricamento in corso",
    variant = "person",
}: {
    label?: string;
    variant?: DetailSkeletonVariant;
}) => (
    <div
        role="status"
        aria-busy="true"
        // Le schede di report e intervento scorrono nel `main` (`self-start`); le altre tre
        // riempiono l'altezza, perché la tabella sotto prenda il resto: vedi le pagine.
        className={cn("flex w-full flex-col gap-4", variant === "person" ? "h-full min-h-0" : "self-start")}
    >
        <span className="sr-only">{label}</span>
        <HeaderSkeleton variant={variant} />
        {variant === "person" ? (
            <PersonBodySkeleton />
        ) : (
            <div className="flex flex-col gap-4">
                <StatsSkeleton />
                {variant === "report" ? <ReportBodySkeleton /> : <InterventionBodySkeleton />}
            </div>
        )}
    </div>
);

// Funzione pura accanto al componente che ne usa la forma: tenerle insieme vale più del fast refresh.
// eslint-disable-next-line react-refresh/only-export-components
export { detailSkeletonVariantForPath };
export default DetailPageSkeleton;
