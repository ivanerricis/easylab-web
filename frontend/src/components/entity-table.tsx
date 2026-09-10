import EntityCardList, { type EntityCardSlot } from "@/components/entity-card-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { cn } from "@/lib/utils";
import { useMemo, type ReactNode } from "react";

export type EntityColumn<TRow> = {
    /** `"actions"` è speciale: quella colonna ospita i pulsanti di riga, non un valore. */
    key: string;
    header: string;
    className?: string;
    render: (row: TRow) => ReactNode;
    /** Dove va la colonna nella scheda su mobile: vedi `EntityCardSlot`. */
    cardSlot?: EntityCardSlot;
};

type EntityTableProps<TRow> = {
    /**
     * Identifica la tabella per le preferenze salvate (per ora le larghezze delle colonne).
     * Stessa convenzione delle righe per pagina: "interventions", "customers", ...
     */
    tableKey: string;
    columns: EntityColumn<TRow>[];
    rows: TRow[];
    getRowKey: (row: TRow) => React.Key;
    emptyMessage: string;
    renderRowActions: (row: TRow) => ReactNode;
    /**
     * Colora la riga in base allo stato (`data-status-color`, interpretato da index.css
     * insieme all'intensità scelta in Impostazioni > Tema). Quando è presente, la cella
     * delle azioni torna ai colori neutri per non tingere le icone dei pulsanti.
     *
     * Su mobile lo stesso colore dà la striscia laterale e il badge della scheda. Prima le
     * schede avevano una mappa a parte (`getAccentClassName`, classi `border-t-*`): due
     * corrispondenze stato -> colore da tenere allineate a mano.
     */
    getRowStatusColor?: (row: TRow) => string;
    /**
     * Doppio click sulla riga per aprire la scheda. Solo desktop: su mobile le righe
     * diventano schede e il doppio click non è un gesto disponibile, quindi lì resta il
     * pulsante "Apri" tra le azioni (che comunque rimane anche su desktop).
     */
    onRowOpen?: (row: TRow) => void;
    /**
     * Primo caricamento, cioè quando non c'è ancora niente da mostrare: al posto delle righe
     * va il loro scheletro, che tiene lo spazio che i dati occuperanno.
     */
    isInitialLoading?: boolean;
    /**
     * Ricarica con i dati già in pagina (ricerca, filtri, cambio pagina). Le righe restano
     * dove sono e leggibili, appena attenuate: prima al loro posto arrivava un velo sfocato
     * su tutta la pagina, che a ogni pausa di battitura nella ricerca copriva anche il campo
     * in cui si stava scrivendo.
     */
    isRefetching?: boolean;
    /** Quante righe-scheletro disegnare: di norma le righe per pagina della tabella. */
    skeletonRowCount?: number;
};

/** La colonna dei pulsanti: niente larghezza propria, si prende lo spazio che avanza. */
const actionsColumnKey = "actions";

/**
 * Quante righe-scheletro disegnare al massimo, qualunque cosa chieda il chiamante.
 *
 * Le pagine passano le proprie righe per pagina, che è la cosa giusta finché sono 10 o 50; ma
 * "Tutte" vale 5000 (`allTableRowsPageSize`), e una riga-scheletro per record voleva dire
 * 45.000 nodi animati prima ancora che i dati arrivassero: misurato, il thread principale
 * restava bloccato per oltre tre minuti e la pagina sembrava piantata.
 *
 * Lo scheletro serve a occupare lo spazio che si vede, non l'intera pagina di dati: oltre lo
 * schermo non lo guarda nessuno. Il tetto sta qui e non nei chiamanti perché così vale per
 * tutte e sette le liste, comprese quelle che verranno.
 */
const maxSkeletonRows = 15;

/**
 * Tabella su desktop, elenco di schede su mobile: è la forma che hanno tutte le liste
 * dell'app. Prima ogni entità ne aveva una copia integrale — sette file identici a meno
 * del nome del DTO, del messaggio di lista vuota e dei pulsanti di riga.
 *
 * Le copie avevano già iniziato a divergere per sbaglio (a `issues-table` era rimasto un
 * `overflow-y-auto` sul `TableBody` che nessun'altra aveva): esattamente il modo in cui
 * questa duplicazione fa danno, perché una differenza involontaria non rompe la
 * compilazione e non la nota nessuno.
 *
 * I pulsanti di riga restano invece del chiamante: sono davvero diversi da un'entità
 * all'altra (i clienti ne hanno sei, i dispositivi due) e ridurli a configurazione
 * costerebbe più di quanto farebbe risparmiare.
 *
 * Le colonne sono trascinabili per il bordo destro dell'intestazione, con la larghezza
 * ricordata per tabella: vedi `useResizableColumns` per il perché della misurazione iniziale.
 * Da qui la conseguenza visibile anche a chi non trascina niente: appena le larghezze sono
 * note la tabella passa a `table-layout: fixed`, quindi un valore più lungo della sua colonna
 * viene troncato con i puntini invece di allargarla.
 */
const EntityTable = <TRow,>({
    tableKey,
    columns,
    rows,
    getRowKey,
    emptyMessage,
    renderRowActions,
    getRowStatusColor,
    onRowOpen,
    isInitialLoading = false,
    isRefetching = false,
    skeletonRowCount = 5,
}: EntityTableProps<TRow>) => {
    const columnKeys = useMemo(() => columns.map((column) => column.key), [columns]);
    const visibleSkeletonRows = Math.min(skeletonRowCount, maxSkeletonRows);

    const { tableRef, isResizable, getColumnWidth, getResizeHandleProps, tableStyle } = useResizableColumns({
        tableKey,
        columnKeys,
        elasticColumnKey: actionsColumnKey,
        canMeasure: rows.length > 0,
    });

    // Il troncamento vale solo dove il contenuto è testo: nella cella delle azioni
    // `overflow: hidden` taglierebbe i contorni di focus dei pulsanti.
    const truncateClassName = (columnKey: string) =>
        isResizable && columnKey !== actionsColumnKey ? "overflow-hidden text-ellipsis" : undefined;

    return (
        <>
            <Table
                ref={tableRef}
                style={tableStyle}
                aria-busy={isInitialLoading || isRefetching}
                className={cn(
                    "hidden bg-background sm:table",
                    // Attenuare è sufficiente a dire "sto ricaricando" e non impedisce di
                    // leggere né di cliccare: chi sta cercando vede la lista precedente finché
                    // non arriva quella nuova. Il conteggio sotto la tabella ha `role="status"`,
                    // quindi il cambiamento è annunciato anche a chi non vede l'attenuazione.
                    isRefetching && "opacity-60 transition-opacity"
                )}
            >
                {isResizable ? (
                    <colgroup>
                        {columns.map((column) => (
                            <col key={column.key} style={{ width: getColumnWidth(column.key) }} />
                        ))}
                    </colgroup>
                ) : null}
                <TableHeader className="w-full">
                    <TableRow>
                        {columns.map((column) => {
                            const resizeHandleProps = getResizeHandleProps(column.key, column.header);

                            return (
                                <TableHead
                                    key={column.key}
                                    className={cn("relative", truncateClassName(column.key), column.className)}
                                >
                                    {column.header}
                                    {resizeHandleProps ? (
                                        // La maniglia sta dentro il `th` e non a cavallo del bordo:
                                        // l'intestazione è in `overflow: hidden` per troncare il
                                        // titolo, quindi la metà esterna verrebbe tagliata via.
                                        <span
                                            {...resizeHandleProps}
                                            className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none transition-colors select-none hover:bg-background/40 focus-visible:bg-background/60 focus-visible:outline-none"
                                        />
                                    ) : null}
                                </TableHead>
                            );
                        })}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isInitialLoading ? (
                        Array.from({ length: visibleSkeletonRows }, (_, rowIndex) => (
                            <TableRow key={`skeleton-${rowIndex}`}>
                                {columns.map((column) => (
                                    <TableCell key={`skeleton-${rowIndex}-${column.key}`}>
                                        {column.key === actionsColumnKey ? (
                                            <Skeleton className="ml-auto h-8 w-24" />
                                        ) : (
                                            <Skeleton className="h-4 w-full" />
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="py-6 text-center text-muted-foreground">
                                {emptyMessage}
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => (
                            <TableRow
                                key={getRowKey(row)}
                                data-status-color={getRowStatusColor?.(row)}
                                className={onRowOpen ? "cursor-pointer select-none" : undefined}
                                onDoubleClick={onRowOpen ? () => onRowOpen(row) : undefined}
                            >
                                {columns.map((column) => (
                                    <TableCell
                                        key={`${getRowKey(row)}-${column.key}`}
                                        className={cn(
                                            truncateClassName(column.key),
                                            column.key === actionsColumnKey && getRowStatusColor
                                                ? "bg-background text-foreground"
                                                : column.className
                                        )}
                                    >
                                        {column.key === actionsColumnKey ? (
                                            // I pulsanti di riga sono l'unico punto interattivo della
                                            // riga: fermare qui il doppio click evita che un click
                                            // ripetuto su un'azione apra anche la scheda.
                                            <div
                                                className="flex items-center justify-end gap-2"
                                                onDoubleClick={(event) => event.stopPropagation()}
                                            >
                                                {renderRowActions(row)}
                                            </div>
                                        ) : (
                                            column.render(row)
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <EntityCardList
                className={cn("sm:hidden", isRefetching && "opacity-60 transition-opacity")}
                columns={columns.filter((column) => column.key !== actionsColumnKey)}
                rows={rows}
                getRowKey={getRowKey}
                getStatusColor={getRowStatusColor}
                renderActions={renderRowActions}
                emptyMessage={emptyMessage}
                isInitialLoading={isInitialLoading}
                skeletonCardCount={Math.min(visibleSkeletonRows, 4)}
            />
        </>
    );
};

export default EntityTable;
