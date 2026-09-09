import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type EntityCardColumn<T> = {
    key: string;
    header: string;
    render: (row: T) => ReactNode;
};

type EntityCardListProps<T> = {
    className?: string;
    columns: EntityCardColumn<T>[];
    rows: T[];
    getRowKey: (row: T) => React.Key;
    /** Color classes for the card's top accent border (e.g. "border-t-green-500"), not a full background. */
    getAccentClassName?: (row: T) => string;
    renderActions?: (row: T) => ReactNode;
    emptyMessage: string;
    /**
     * La colonna che fa da titolo della scheda: viene tolta dall'elenco e messa in testa, più
     * grande. Serve perché su mobile una scheda con dieci coppie etichetta/valore tutte dello
     * stesso peso non ha un punto da cui iniziare a leggere — e la riga che conta è sempre la
     * stessa (il cliente, il nome). Senza questa proprietà il comportamento è quello di prima.
     */
    titleColumnKey?: string;
    /** Primo caricamento: schede-scheletro invece di un vuoto che poi salta. */
    isInitialLoading?: boolean;
    skeletonCardCount?: number;
};

const EntityCardList = <T,>({
    className,
    columns,
    rows,
    getRowKey,
    getAccentClassName,
    renderActions,
    emptyMessage,
    titleColumnKey,
    isInitialLoading = false,
    skeletonCardCount = 3,
}: EntityCardListProps<T>) => {
    const titleColumn = titleColumnKey ? columns.find((column) => column.key === titleColumnKey) : undefined;
    const detailColumns = titleColumn ? columns.filter((column) => column.key !== titleColumn.key) : columns;

    if (isInitialLoading) {
        return (
            <div className={cn("flex flex-col gap-3 sm:hidden", className)} aria-busy="true">
                {Array.from({ length: skeletonCardCount }, (_, index) => (
                    <div key={`skeleton-${index}`} className="rounded-lg border-2 border-t-8 bg-background p-3">
                        <Skeleton className="h-5 w-2/3" />
                        <div className="mt-3 flex flex-col gap-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-4/6" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className={cn("py-6 text-center text-sm text-muted-foreground sm:hidden", className)}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col gap-3 sm:hidden", className)}>
            {rows.map((row) => (
                <div
                    key={getRowKey(row)}
                    className={cn("rounded-lg border-2 border-t-8 bg-background p-3", getAccentClassName?.(row))}
                >
                    {titleColumn ? (
                        <h3 className="mb-2 border-b pb-2 text-base font-semibold break-words">
                            {titleColumn.render(row)}
                        </h3>
                    ) : null}
                    <dl className="flex flex-col gap-1.5">
                        {detailColumns.map((column) => (
                            <div key={column.key} className="flex items-baseline justify-between gap-3 text-sm">
                                <dt className="text-muted-foreground">{column.header}</dt>
                                <dd className="text-right font-medium break-words">{column.render(row)}</dd>
                            </div>
                        ))}
                    </dl>
                    {renderActions ? (
                        <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
                            {renderActions(row)}
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    );
};

export default EntityCardList;
