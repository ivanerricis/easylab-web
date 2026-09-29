import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { memo, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import StatusBadge from "@/components/status-badge";
import DetailItem, { DetailGrid } from "@/components/detail-item";
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
 * - `wide`: un valore che tende a essere lungo (difetto, email): va sotto la sua etichetta,
 *   allineato a sinistra, invece di andare a capo tre volte stretto a destra dell'etichetta.
 *
 * Le colonne senza posto sono i dettagli, una riga ciascuna: etichetta a sinistra, valore a
 * destra, linea sottile fra le righe. È lo schema delle schede di dettaglio (`DetailGrid
 * layout="rows"`), usato qui tale e quale: la lista e la scheda che si apre toccandone una voce
 * si leggono allo stesso modo.
 */
export type EntityCardSlot = "title" | "badge" | "wide";

export type EntityCardColumn<T> = {
    key: string;
    header: string;
    render: (row: T) => ReactNode;
    cardSlot?: EntityCardSlot;
    /**
     * Un dettaglio secondario, che nella scheda si vede solo aprendola. La scheda di un report
     * aveva otto righe e superava l'altezza di un telefono: in una lista si cerca il cliente, il
     * dispositivo e il difetto, il resto serve solo a volte. Il comando per aprirla c'è solo se
     * la lista ha almeno una colonna così.
     */
    cardCollapsed?: boolean;
    /**
     * Toglie la riga da una singola scheda quando per quella voce non dice niente: l'errore di un
     * log riuscito, per esempio. Deciso scheda per scheda e non per la lista intera: con un solo
     * errore in pagina, prima tutte le schede riuscite mostravano "Errore" con il valore vuoto.
     */
    cardHiddenWhen?: (row: T) => boolean;
};

/**
 * La colonna dell'ID non è un dettaglio come gli altri: è un riferimento ("il report 3174"),
 * quindi va sopra il titolo come `#3174` invece di occupare una riga intera. Tutte le liste
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
    /**
     * Il messaggio dell'ultimo caricamento fallito (`error` di `usePaginatedRows`): senza righe,
     * va al posto di `emptyMessage`, con "Riprova" se c'è `onRetry`. Vedi `LoadErrorState`.
     */
    loadError?: string | null;
    onRetry?: () => void;
    /** Primo caricamento: schede-scheletro invece di un vuoto che poi salta. */
    isInitialLoading?: boolean;
    skeletonCardCount?: number;
    /**
     * Da quale larghezza le schede lasciano il posto alla tabella. Di serie `sm:hidden`, come
     * `EntityTable`; i Log di Impostazioni lo spostano su una container query perché la loro
     * tabella non ci sta in una sezione stretta. È una prop a sé e non un `className`: per
     * mostrare le schede oltre `sm` da fuori servirebbe un `sm:flex`, che romperebbe lo stato
     * vuoto (un blocco centrato, non un flex).
     */
    hiddenFromClassName?: string;
};

const cardClassName = "relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs";

type EntityCardProps<T> = {
    row: T;
    rowKey: React.Key;
    idColumn?: EntityCardColumn<T>;
    titleColumns: EntityCardColumn<T>[];
    badgeColumn?: EntityCardColumn<T>;
    detailColumns: EntityCardColumn<T>[];
    showIdAboveTitle: boolean;
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
    prev.showIdAboveTitle === next.showIdAboveTitle &&
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
    showIdAboveTitle,
    statusColor,
    renderActions,
}: EntityCardProps<T>) => {
    const status = isStatusColor(statusColor) ? statusStyles[statusColor] : null;
    // Ricalcolate solo quando `row` cambia, come `actionsNode` in `EntityTableRowImpl`: vedi il
    // commento lì per il perché non è un ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const actionsNode = useMemo(() => renderActions?.(row), [row]);
    const [isExpanded, setIsExpanded] = useState(false);
    const detailsId = useId();
    const hiddenCount = detailColumns.filter((column) => column.cardCollapsed).length;
    const visibleDetailColumns = (
        isExpanded ? detailColumns : detailColumns.filter((column) => !column.cardCollapsed)
    ).filter((column) => !column.cardHiddenWhen?.(row));

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

        // Senza una colonna titolo la scheda si chiama col suo ID, che allora non si ripete sopra.
        return idColumn ? `#${String(idColumn.render(row))}` : null;
    };

    return (
        <article className={cardClassName}>
            {status ? (
                <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1.5", status.stripe)} />
            ) : null}

            <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
                <div className="flex min-w-0 flex-col items-start">
                    {/* Il numero sopra il nome, in una pillola nel colore del testo: piccolo e
                        grigio sotto il nome si perdeva, ed è ciò che si cerca per primo quando
                        il cliente al telefono dice "il report 3174". */}
                    {showIdAboveTitle ? (
                        <p className="mb-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground tabular-nums">
                            #{idColumn?.render(row)}
                        </p>
                    ) : null}
                    {/* `h2` e non `h3`: nelle liste il titolo sopra è l'`h1` della pagina, e un
                        salto di livello fa credere a chi naviga per titoli che manchi un pezzo. */}
                    <h2 className="text-base leading-snug font-semibold break-words">{renderTitle()}</h2>
                </div>
                {badgeColumn ? (
                    <StatusBadge color={isStatusColor(statusColor) ? statusColor : undefined}>
                        <span className="sr-only">{badgeColumn.header}: </span>
                        {badgeColumn.render(row)}
                    </StatusBadge>
                ) : null}
            </div>

            {visibleDetailColumns.length > 0 ? (
                // Prima i dettagli erano su due colonne, etichetta sopra e valore sotto (CHANGELOG
                // 2026-09-10): le righe etichetta/valore di allora mandavano a capo i valori lunghi
                // allineati a destra. Qui quel problema lo risolve `wide` → `longText`, che mette il
                // valore sotto l'etichetta, come fanno problema e note nella scheda report.
                <div id={detailsId} className={cn("px-4 pt-2", hiddenCount > 0 ? "pb-1" : "pb-2.5")}>
                    <DetailGrid layout="rows">
                        {visibleDetailColumns.map((column) => (
                            <DetailItem
                                key={column.key}
                                label={column.header}
                                value={column.render(row)}
                                longText={column.cardSlot === "wide"}
                            />
                        ))}
                    </DetailGrid>
                </div>
            ) : (
                <div className="pb-3.5" />
            )}

            {hiddenCount > 0 ? (
                // Stessa freccia della card dei dati nella scheda cliente, ma con il testo: in
                // una lista di schede una freccia sola in fondo non si capisce a cosa si riferisca.
                // Le righe nascoste non sono nel DOM, non solo nascoste col CSS: le schede ci
                // sono solo su telefono, e lì da chiuse non devono esserci per nessuno.
                <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    onClick={() => setIsExpanded((expanded) => !expanded)}
                    className={cn(
                        "flex w-full items-center justify-center gap-1.5 px-4 pb-2.5 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline",
                        "min-h-10"
                    )}
                >
                    {isExpanded ? "Meno dettagli" : `Altri dettagli (${hiddenCount})`}
                    <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                </button>
            ) : null}

            {renderActions ? (
                // I pulsanti si dividono la larghezza della scheda: su un telefono sono l'unico
                // modo di agire sulla riga, e un bersaglio largo quanto un pollice sbaglia meno
                // di un'icona da 40px allineata a destra. `empty:hidden` per le righe bloccate
                // (la voce fissa dei difetti), che non hanno pulsanti: senza, restava una fascia
                // grigia vuota in fondo.
                // La striscia di stato copre i primi 6px a sinistra: senza compensarli lo spazio
                // visibile a sinistra dei pulsanti era la metà di quello a destra (`pl-4.5` =
                // 12px di padding + 6px di striscia).
                <div
                    className={cn(
                        "flex items-center gap-2 border-t bg-muted/40 px-3 py-2.5 *:h-11 *:w-auto *:min-w-0 *:flex-1 empty:hidden",
                        status && "pl-4.5"
                    )}
                >
                    {actionsNode}
                </div>
            ) : null}
        </article>
    );
};

// `memo` da solo non capisce i generici: il cast riporta il tipo che ha `EntityCardImpl`.
const EntityCard = memo(EntityCardImpl, areCardPropsEqual) as typeof EntityCardImpl;

/**
 * "Impossibile caricare …" con il pulsante "Riprova", al posto del messaggio di lista vuota.
 *
 * Prima una lista che non si era potuta leggere (rete assente, server fermo) e una lista
 * davvero vuota erano la stessa cosa a schermo: sparito il toast, restava "Nessun report
 * disponibile.", che è un'affermazione falsa, e per riprovare bisognava ricaricare l'intera
 * applicazione. Condiviso fra la tabella (`EntityTable`) e le schede, che lo mostrano uguale.
 */
export const LoadErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div className="flex flex-col items-center gap-3 text-center">
        <p className="font-medium text-foreground">{message}.</p>
        {onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
                <RefreshCw />
                Riprova
            </Button>
        ) : null}
    </div>
);

const EntityCardList = <T,>({
    className,
    columns,
    rows,
    getRowKey,
    getStatusColor,
    renderActions,
    emptyMessage,
    loadError,
    onRetry,
    isInitialLoading = false,
    skeletonCardCount = 3,
    hiddenFromClassName = "sm:hidden",
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
    const showIdAboveTitle = idColumn != null && titleColumns.length > 0;

    if (isInitialLoading) {
        return (
            <div className={cn("flex flex-col gap-3", hiddenFromClassName, className)} aria-busy="true">
                {Array.from({ length: skeletonCardCount }, (_, index) => (
                    <div key={`skeleton-${index}`} className={cn(cardClassName, "p-4")}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-1 flex-col gap-1.5">
                                <Skeleton className="h-6 w-14" />
                                <Skeleton className="h-5 w-2/3" />
                            </div>
                            <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <div className="mt-2 divide-y">
                            {Array.from({ length: 4 }, (_, cellIndex) => (
                                <div key={cellIndex} className="flex items-center justify-between gap-4 py-3">
                                    <Skeleton className="h-3.5 w-1/4" />
                                    <Skeleton className="h-4 w-2/5" />
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
            <div className={cn("py-6 text-center text-sm text-muted-foreground", hiddenFromClassName, className)}>
                {loadError ? <LoadErrorState message={loadError} onRetry={onRetry} /> : emptyMessage}
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col gap-3", hiddenFromClassName, className)}>
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
                        showIdAboveTitle={showIdAboveTitle}
                        statusColor={getStatusColor?.(row)}
                        renderActions={renderActions}
                    />
                );
            })}
        </div>
    );
};

export default EntityCardList;
