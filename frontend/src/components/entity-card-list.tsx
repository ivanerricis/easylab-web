import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { memo, useMemo, type ReactNode } from "react";
import StatusBadge from "@/components/status-badge";
import { isStatusColor, statusStyles } from "@/lib/statusColors";

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

type EntityCardProps<T> = {
    row: T;
    rowKey: React.Key;
    idColumn?: EntityCardColumn<T>;
    titleColumns: EntityCardColumn<T>[];
    badgeColumn?: EntityCardColumn<T>;
    detailColumns: EntityCardColumn<T>[];
    showIdBelowTitle: boolean;
    statusColor?: string;
    renderActions?: (row: T) => ReactNode;
};

/**
 * Confronta solo le prop che contano per decidere se ridisegnare la scheda: stessa lista di
 * `areRowPropsEqual` in `entity-table.tsx`, per la stessa ragione — `renderActions` resta fuori
 * apposta perché arriva quasi sempre come closure inline diversa a ogni render del chiamante,
 * anche quando la riga non c'entra.
 *
 * Non generica (T fisso a `unknown`): è la forma che `memo` si aspetta per il suo secondo
 * argomento, e il confronto qui dentro è comunque per campo, non serve conoscere T per davvero.
 */
const areCardPropsEqual = (prev: EntityCardProps<unknown>, next: EntityCardProps<unknown>) =>
    prev.row === next.row &&
    prev.rowKey === next.rowKey &&
    prev.idColumn === next.idColumn &&
    prev.titleColumns === next.titleColumns &&
    prev.badgeColumn === next.badgeColumn &&
    prev.detailColumns === next.detailColumns &&
    prev.showIdBelowTitle === next.showIdBelowTitle &&
    prev.statusColor === next.statusColor;

/**
 * Una scheda, isolata in un componente a parte e avvolta in `memo`: stessa ragione di
 * `EntityTableRow` in `entity-table.tsx`, di cui questa è la forma su mobile della stessa riga.
 * Le colonne derivate (`titleColumns`, `detailColumns`, ...) arrivano già calcolate e
 * memoizzate dal chiamante: senza, un nuovo array a ogni render di `EntityCardList` avrebbe
 * invalidato da solo il confronto qui sopra per ogni scheda.
 */
const EntityCardImpl = <T,>({
    row,
    idColumn,
    titleColumns,
    badgeColumn,
    detailColumns,
    showIdBelowTitle,
    statusColor,
    renderActions,
}: EntityCardProps<T>) => {
    const status = isStatusColor(statusColor) ? statusStyles[statusColor] : null;
    // Ricalcolate solo quando `row` cambia, come `actionsNode` in `EntityTableRowImpl`: vedi il
    // commento lì per il perché non è un ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const actionsNode = useMemo(() => renderActions?.(row), [row]);

    const renderTitle = () => {
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
        <article className={cardClassName}>
            {status ? <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", status.stripe)} /> : null}

            <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
                <div className="min-w-0">
                    <h3 className="text-base leading-snug font-semibold break-words">{renderTitle()}</h3>
                    {showIdBelowTitle ? (
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">#{idColumn?.render(row)}</p>
                    ) : null}
                </div>
                {badgeColumn ? (
                    <StatusBadge color={isStatusColor(statusColor) ? statusColor : undefined}>
                        <span className="sr-only">{badgeColumn.header}: </span>
                        {badgeColumn.render(row)}
                    </StatusBadge>
                ) : null}
            </div>

            {detailColumns.length > 0 ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 pt-3 pb-3.5">
                    {detailColumns.map((column) => (
                        <div key={column.key} className={cn("min-w-0", column.cardSlot === "wide" && "col-span-2")}>
                            <dt className="text-xs text-muted-foreground">{column.header}</dt>
                            <dd className="mt-0.5 text-sm font-medium break-words">{column.render(row)}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <div className="pb-3.5" />
            )}

            {renderActions ? (
                // I pulsanti si dividono la larghezza della scheda: su un telefono sono l'unico
                // modo di agire sulla riga, e un bersaglio largo quanto un pollice sbaglia meno
                // di un'icona da 40px allineata a destra. `empty:hidden` per le righe bloccate
                // (la voce fissa dei difetti), che non hanno pulsanti: senza, restava una fascia
                // grigia vuota in fondo.
                <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-2.5 *:h-11 *:w-auto *:min-w-0 *:flex-1 empty:hidden">
                    {actionsNode}
                </div>
            ) : null}
        </article>
    );
};

// `memo` da solo non capisce i generici: il cast riporta il tipo che ha `EntityCardImpl`.
const EntityCard = memo(EntityCardImpl, areCardPropsEqual) as typeof EntityCardImpl;

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
    const idColumn = useMemo(() => columns.find((column) => column.key === idColumnKey), [columns]);
    const titleColumns = useMemo(() => columns.filter((column) => column.cardSlot === "title"), [columns]);
    const badgeColumn = useMemo(() => columns.find((column) => column.cardSlot === "badge"), [columns]);
    const detailColumns = useMemo(
        () =>
            columns.filter(
                (column) => column !== idColumn && column.cardSlot !== "title" && column.cardSlot !== "badge"
            ),
        [columns, idColumn]
    );
    const showIdBelowTitle = idColumn != null && titleColumns.length > 0;

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

    return (
        <div className={cn("flex flex-col gap-3 sm:hidden", className)}>
            {rows.map((row) => {
                const rowKey = getRowKey(row);

                return (
                    <EntityCard
                        key={rowKey}
                        row={row}
                        rowKey={rowKey}
                        idColumn={idColumn}
                        titleColumns={titleColumns}
                        badgeColumn={badgeColumn}
                        detailColumns={detailColumns}
                        showIdBelowTitle={showIdBelowTitle}
                        statusColor={getStatusColor?.(row)}
                        renderActions={renderActions}
                    />
                );
            })}
        </div>
    );
};

export default EntityCardList;
