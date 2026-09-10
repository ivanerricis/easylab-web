import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Dove va una colonna nella scheda su mobile. Lo dice la colonna stessa, accanto alla sua
 * definizione, invece di una proprietà per ogni tabella: prima il titolo arrivava come
 * `titleColumnKey` e andava fatto passare per `EntityTable`, `EntityCrudTable` e ogni pagina,
 * col risultato che le quattro anagrafiche non ce l'avevano affatto.
 *
 * - `title`: il titolo della scheda. Più colonne `title` si leggono una di seguito all'altra
 *   (nome e cognome).
 * - `badge`: lo stato, in un badge in alto a destra colorato come la riga della tabella.
 * - `wide`: un valore che tende a essere lungo (difetto, email) e prende tutta la larghezza
 *   invece di andare a capo tre volte in mezza scheda.
 *
 * Le colonne senza posto sono i dettagli, su due colonne.
 */
export type EntityCardSlot = "title" | "badge" | "wide";

export type EntityCardColumn<T> = {
    key: string;
    header: string;
    render: (row: T) => ReactNode;
    cardSlot?: EntityCardSlot;
};

/** Gli stessi nomi di `data-status-color` sulle righe della tabella. */
type StatusStyle = { stripe: string; badge: string; dot: string };

const statusStyles: Record<string, StatusStyle> = {
    red: {
        stripe: "bg-status-red",
        badge: "bg-status-red/12 text-status-red-foreground ring-status-red/25",
        dot: "bg-status-red",
    },
    yellow: {
        stripe: "bg-status-yellow",
        badge: "bg-status-yellow/15 text-status-yellow-foreground ring-status-yellow/35",
        dot: "bg-status-yellow",
    },
    green: {
        stripe: "bg-status-green",
        badge: "bg-status-green/12 text-status-green-foreground ring-status-green/25",
        dot: "bg-status-green",
    },
};

/**
 * La colonna dell'ID non è un dettaglio come gli altri: è un riferimento ("il report 3174"),
 * quindi va sotto il titolo come `#3174` invece di occupare una riga intera. Tutte le liste
 * dell'app ce l'hanno con questa chiave, come "actions" per i pulsanti in `EntityTable`.
 */
const idColumnKey = "id";

/** Il segnaposto che le colonne usano per un valore assente: in un titolo non va mostrato. */
const emptyValuePlaceholder = "-";

type EntityCardListProps<T> = {
    className?: string;
    columns: EntityCardColumn<T>[];
    rows: T[];
    getRowKey: (row: T) => React.Key;
    /** Colore di stato della scheda: "red" | "yellow" | "green", come `getRowStatusColor`. */
    getStatusColor?: (row: T) => string | undefined;
    renderActions?: (row: T) => ReactNode;
    emptyMessage: string;
    /** Primo caricamento: schede-scheletro invece di un vuoto che poi salta. */
    isInitialLoading?: boolean;
    skeletonCardCount?: number;
};

const cardClassName = "relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs";

const EntityCardList = <T,>({
    className,
    columns,
    rows,
    getRowKey,
    getStatusColor,
    renderActions,
    emptyMessage,
    isInitialLoading = false,
    skeletonCardCount = 3,
}: EntityCardListProps<T>) => {
    const idColumn = columns.find((column) => column.key === idColumnKey);
    const titleColumns = columns.filter((column) => column.cardSlot === "title");
    const badgeColumn = columns.find((column) => column.cardSlot === "badge");
    const detailColumns = columns.filter(
        (column) => column !== idColumn && column.cardSlot !== "title" && column.cardSlot !== "badge"
    );

    if (isInitialLoading) {
        return (
            <div className={cn("flex flex-col gap-3 sm:hidden", className)} aria-busy="true">
                {Array.from({ length: skeletonCardCount }, (_, index) => (
                    <div key={`skeleton-${index}`} className={cn(cardClassName, "p-4")}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-1 flex-col gap-1.5">
                                <Skeleton className="h-5 w-2/3" />
                                <Skeleton className="h-3 w-12" />
                            </div>
                            <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                            {Array.from({ length: 4 }, (_, cellIndex) => (
                                <div key={cellIndex} className="flex flex-col gap-1.5">
                                    <Skeleton className="h-3 w-1/2" />
                                    <Skeleton className="h-4 w-4/5" />
                                </div>
                            ))}
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

    const renderTitle = (row: T) => {
        const parts = titleColumns
            .map((column) => ({ key: column.key, value: column.render(row) }))
            .filter(({ value }) => value != null && value !== "" && value !== emptyValuePlaceholder);

        if (parts.length > 0) {
            return parts.map(({ key, value }, index) => (
                <span key={key}>
                    {index > 0 ? " " : null}
                    {value}
                </span>
            ));
        }

        // Senza una colonna titolo la scheda si chiama col suo ID, che allora non si ripete sotto.
        return idColumn ? `#${String(idColumn.render(row))}` : null;
    };

    return (
        <div className={cn("flex flex-col gap-3 sm:hidden", className)}>
            {rows.map((row) => {
                const status = statusStyles[getStatusColor?.(row) ?? ""];
                const showIdBelowTitle = idColumn != null && titleColumns.length > 0;

                return (
                    <article key={getRowKey(row)} className={cardClassName}>
                        {status ? (
                            <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", status.stripe)} />
                        ) : null}

                        <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
                            <div className="min-w-0">
                                <h3 className="text-base leading-snug font-semibold break-words">{renderTitle(row)}</h3>
                                {showIdBelowTitle ? (
                                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                                        #{idColumn.render(row)}
                                    </p>
                                ) : null}
                            </div>
                            {badgeColumn ? (
                                <span
                                    className={cn(
                                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
                                        status?.badge ?? "bg-muted text-muted-foreground ring-border"
                                    )}
                                >
                                    {status ? (
                                        <span aria-hidden="true" className={cn("size-1.5 rounded-full", status.dot)} />
                                    ) : null}
                                    <span className="sr-only">{badgeColumn.header}: </span>
                                    {badgeColumn.render(row)}
                                </span>
                            ) : null}
                        </div>

                        {detailColumns.length > 0 ? (
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 pt-3 pb-3.5">
                                {detailColumns.map((column) => (
                                    <div
                                        key={column.key}
                                        className={cn("min-w-0", column.cardSlot === "wide" && "col-span-2")}
                                    >
                                        <dt className="text-xs text-muted-foreground">{column.header}</dt>
                                        <dd className="mt-0.5 text-sm font-medium break-words">{column.render(row)}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <div className="pb-3.5" />
                        )}

                        {renderActions ? (
                            // I pulsanti si dividono la larghezza della scheda: su un telefono sono
                            // l'unico modo di agire sulla riga, e un bersaglio largo quanto un pollice
                            // sbaglia meno di un'icona da 40px allineata a destra.
                            // `empty:hidden` per le righe bloccate (la voce fissa dei difetti), che
                            // non hanno pulsanti: senza, restava una fascia grigia vuota in fondo.
                            <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-2.5 *:h-11 *:w-auto *:min-w-0 *:flex-1 empty:hidden">
                                {renderActions(row)}
                            </div>
                        ) : null}
                    </article>
                );
            })}
        </div>
    );
};

export default EntityCardList;
