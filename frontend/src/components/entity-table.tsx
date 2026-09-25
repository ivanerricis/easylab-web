import EntityCardList, { type EntityCardSlot } from "@/components/entity-card-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useListScrollRestoration } from "@/hooks/useListScrollRestoration";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import type { SortDirection, TableSort } from "@/lib/tableSort";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";

export type EntityColumn<TRow> = {
    /** `"actions"` è speciale: quella colonna ospita i pulsanti di riga, non un valore. */
    key: string;
    header: string;
    className?: string;
    render: (row: TRow) => ReactNode;
    /** Dove va la colonna nella scheda su mobile: vedi `EntityCardSlot`. */
    cardSlot?: EntityCardSlot;
    /**
     * Il campo `sortBy` dell'API che ordina per questa colonna. Solo le colonne che il server
     * sa ordinare ce l'hanno: un'intestazione cliccabile che non fa niente sarebbe peggio di
     * una ferma.
     */
    sortKey?: string;
    /** Il verso del primo clic: di norma "asc" per i testi e "desc" per date e importi. */
    defaultSortDirection?: SortDirection;
    /**
     * Se il menu "Colonne" può nasconderla (di norma sì). No per le colonne che identificano la
     * riga, come il cliente: senza, la tabella diventa un elenco di valori senza padrone.
     */
    hideable?: boolean;
};

const ariaSortValue = { asc: "ascending", desc: "descending" } as const;

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
    /** L'ordinamento in vigore, per disegnare la freccia sulla colonna giusta. */
    sort?: TableSort;
    /**
     * Con questa, le colonne che hanno un `sortKey` si ordinano cliccando l'intestazione. È un
     * modo in più, non l'unico: il menu "Ordina per" resta, perché su mobile le intestazioni
     * non ci sono (la tabella diventa un elenco di schede).
     */
    onSortChange?: (sort: TableSort) => void;
    /**
     * Colonne da non disegnare, scelte dal menu "Colonne". Valgono solo per la tabella: le
     * schede su mobile mostrano già un sottoinsieme deciso da `cardSlot`, e lì il menu non c'è.
     */
    hiddenColumnKeys?: readonly string[];
};

/** La colonna dei pulsanti: niente larghezza propria, si prende lo spazio che avanza. */
const actionsColumnKey = "actions";

/** La colonna dell'identificativo, che non deve mai finire troncata: vedi `idColumnClassName`. */
const idColumnKey = "id";

/**
 * Soglia minima della colonna ID: cinque cifre (gli ID arrivano a 19.735) più il padding.
 * Con `table-layout: fixed` un `min-width` sulle celle non conta niente, ma durante la misura la
 * tabella è in `auto` (vedi `measureNaturalWidths`) e lì il browser lo rispetta: la soglia entra
 * così nella larghezza misurata e poi congelata. `tabular-nums` rende le cifre tutte larghe uguali,
 * quindi cinque "0" bastano davvero per qualunque ID a cinque cifre.
 */
const idColumnClassName = "min-w-[calc(5ch+1rem)] tabular-nums";

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

type EntityTableRowProps<TRow> = {
    row: TRow;
    rowKey: React.Key;
    columns: EntityColumn<TRow>[];
    isResizable: boolean;
    getRowStatusColor?: (row: TRow) => string;
    onRowOpen?: (row: TRow) => void;
    renderRowActions: (row: TRow) => ReactNode;
};

/**
 * Confronta solo le prop che contano per decidere se ridisegnare la riga: `row` — le liste
 * sostituiscono l'intero array a ogni ricarica, quindi una riga davvero cambiata (anche solo
 * modificata) arriva sempre con un riferimento nuovo — più `columns` e `isResizable`.
 *
 * `getRowStatusColor`, `onRowOpen` e `renderRowActions` restano fuori apposta: chi chiama
 * `EntityTable` li passa quasi sempre come closure inline nel proprio corpo, quindi diversi a
 * ogni suo render anche quando la riga non c'entra (la ricerca che digita cambia la pagina, non
 * le righe). Confrontarli avrebbe vanificato `memo` a ogni battitura. Restano comunque corrette
 * quando chiamate, perché `EntityTableRowImpl` le richiama sempre da capo — non da un ref — ogni
 * volta che la riga si ridisegna per un motivo vero.
 *
 * Non generica (TRow fisso a `unknown`): è la forma che `memo` si aspetta per il suo secondo
 * argomento, e il confronto qui dentro è comunque per campo, non serve conoscere TRow per davvero.
 */
const areRowPropsEqual = (prev: EntityTableRowProps<unknown>, next: EntityTableRowProps<unknown>) =>
    prev.row === next.row &&
    prev.rowKey === next.rowKey &&
    prev.columns === next.columns &&
    prev.isResizable === next.isResizable;

/**
 * Una riga della tabella, isolata in un componente a parte e avvolta in `memo`.
 *
 * Prima ogni riga veniva ridisegnata da capo a ogni render di `EntityTable`, anche quando né
 * lei né le sue colonne erano cambiate: con "Tutte" (fino a 5000 righe) digitare nel campo di
 * ricerca o trascinare una colonna ricalcolava tutte le celle di tutte le righe, anche quelle
 * che il risultato non tocca. Qui `memo` (con `areRowPropsEqual` sopra) salta il render quando
 * `row` non è cambiata.
 */
const EntityTableRowImpl = <TRow,>({
    row,
    rowKey,
    columns,
    isResizable,
    getRowStatusColor,
    onRowOpen,
    renderRowActions,
}: EntityTableRowProps<TRow>) => {
    // Il troncamento vale solo dove il contenuto è testo: nella cella delle azioni
    // `overflow: hidden` taglierebbe i contorni di focus dei pulsanti.
    const truncateClassName = (columnKey: string) =>
        isResizable && columnKey !== actionsColumnKey ? "overflow-hidden text-ellipsis" : undefined;

    // Calcolati una volta sola per `row`, non ricreati a ogni carattere digitato altrove nella
    // pagina: vedi il commento su `areRowPropsEqual`. La dipendenza è solo `row` di proposito —
    // quando la riga stessa non cambia si riusa il risultato precedente, quando cambia si
    // richiama la versione di `getRowStatusColor`/`renderRowActions` in ambito in quel momento,
    // mai una vecchia letta da un ref (che arriverebbe in ritardo di un render, sbagliando
    // proprio al primo montaggio della riga: coi dati appena caricati sarebbe ancora quella
    // dello scheletro, senza righe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const statusColor = useMemo(() => getRowStatusColor?.(row), [row]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const actionsNode = useMemo(() => renderRowActions(row), [row]);

    // I punti interattivi della riga (link, pulsanti, la cella delle azioni) gestiscono già da
    // sé il proprio doppio click: qui basta ignorarlo invece di fermarlo con `stopPropagation`
    // in ognuno di essi. Prima solo alcuni lo facevano — `customer-link.tsx` e la cella delle
    // azioni, ma non `hover-detail-cell.tsx` — e un doppio click su un bottone rimasto scoperto
    // (es. "Altro" nella colonna del difetto) apriva il suo popover *e* la scheda insieme.
    const handleRowDoubleClick = onRowOpen
        ? (event: React.MouseEvent<HTMLTableRowElement>) => {
              const target = event.target;

              if (target instanceof HTMLElement && target.closest("a, button, input, [role=button]")) {
                  return;
              }

              onRowOpen(row);
          }
        : undefined;

    return (
        <TableRow
            data-status-color={statusColor}
            className={onRowOpen ? "cursor-pointer select-none" : undefined}
            onDoubleClick={handleRowDoubleClick}
        >
            {columns.map((column) => (
                <TableCell
                    key={`${rowKey}-${column.key}`}
                    className={cn(
                        truncateClassName(column.key),
                        column.key === idColumnKey && "tabular-nums",
                        column.key === actionsColumnKey && getRowStatusColor
                            ? "bg-card text-foreground"
                            : column.className
                    )}
                >
                    {column.key === actionsColumnKey ? (
                        // `min-h-10` è l'altezza di un pulsante `icon-lg`: una riga senza azioni
                        // (la voce fissa "Altro" in Difetti) era alta 38px contro i 58 delle altre.
                        <div className="flex min-h-10 items-center justify-end gap-2">{actionsNode}</div>
                    ) : (
                        column.render(row)
                    )}
                </TableCell>
            ))}
        </TableRow>
    );
};

// `memo` da solo non capisce i generici: il cast riporta il tipo che ha `EntityTableRowImpl`.
const EntityTableRow = memo(EntityTableRowImpl, areRowPropsEqual) as typeof EntityTableRowImpl;

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
    columns: allColumns,
    rows,
    getRowKey,
    emptyMessage,
    renderRowActions,
    getRowStatusColor,
    onRowOpen,
    isInitialLoading = false,
    isRefetching = false,
    skeletonRowCount = 5,
    sort,
    onSortChange,
    hiddenColumnKeys,
}: EntityTableProps<TRow>) => {
    const columns = useMemo(
        () =>
            hiddenColumnKeys?.length
                ? allColumns.filter((column) => !hiddenColumnKeys.includes(column.key))
                : allColumns,
        [allColumns, hiddenColumnKeys]
    );
    const columnKeys = useMemo(() => columns.map((column) => column.key), [columns]);
    // Le schede su mobile mostrano tutte le colonne tranne le azioni, senza il filtro del menu
    // "Colonne" (vedi il commento sulla prop `hiddenColumnKeys`): un `useMemo` a parte, e non
    // un `.filter` dentro il JSX, perché altrimenti ogni render di `EntityTable` produceva un
    // array nuovo e invalidava da solo il `memo` di ogni scheda più sotto.
    const cardColumns = useMemo(() => allColumns.filter((column) => column.key !== actionsColumnKey), [allColumns]);
    const visibleSkeletonRows = Math.min(skeletonRowCount, maxSkeletonRows);

    const { tableRef, isResizable, getColumnWidth, getResizeHandleProps, tableStyle } = useResizableColumns({
        tableKey,
        columnKeys,
        elasticColumnKey: actionsColumnKey,
        canMeasure: rows.length > 0,
        // Righe nuove, misure da ricontrollare: vedi `growNaturalWidths`.
        dataVersion: rows,
    });
    useListScrollRestoration({ anchorRef: tableRef, tableKey, isReady: !isInitialLoading && rows.length > 0 });

    // Il troncamento vale solo dove il contenuto è testo: nella cella delle azioni
    // `overflow: hidden` taglierebbe i contorni di focus dei pulsanti. Questa versione serve
    // solo all'intestazione: quella delle celle di riga vive in `EntityTableRowImpl`.
    const truncateClassName = (columnKey: string) =>
        isResizable && columnKey !== actionsColumnKey ? "overflow-hidden text-ellipsis" : undefined;

    return (
        <>
            <Table
                ref={tableRef}
                style={tableStyle}
                aria-busy={isInitialLoading || isRefetching}
                // Si nasconde il contenitore, non la tabella: vedi `containerClassName` in `Table`.
                containerClassName="hidden sm:block"
                className={cn(
                    "bg-card",
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
                            const sortKey = onSortChange ? column.sortKey : undefined;
                            const sortDirection = sortKey != null && sort?.key === sortKey ? sort.direction : undefined;
                            const SortIcon =
                                sortDirection === "asc" ? ArrowUp : sortDirection === "desc" ? ArrowDown : ArrowUpDown;

                            return (
                                <TableHead
                                    key={column.key}
                                    // `aria-sort` sulla colonna ordinata: è ciò che fa dire a uno
                                    // screen reader "ordinata in modo crescente" arrivando lì.
                                    aria-sort={sortDirection ? ariaSortValue[sortDirection] : undefined}
                                    className={cn(
                                        "relative",
                                        truncateClassName(column.key),
                                        column.key === idColumnKey && idColumnClassName,
                                        column.className
                                    )}
                                >
                                    {sortKey != null && onSortChange ? (
                                        <button
                                            type="button"
                                            className={cn(
                                                // `max-w-full` e `truncate` tengono il titolo dentro la
                                                // colonna; `pr-2` lascia libera la maniglia di
                                                // ridimensionamento, che sta sul bordo destro.
                                                "inline-flex max-w-full cursor-pointer items-center gap-1 rounded-sm pr-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                                                sortDirection && "font-semibold"
                                            )}
                                            onClick={() =>
                                                onSortChange({
                                                    key: sortKey,
                                                    // Un secondo clic sulla stessa colonna inverte il verso.
                                                    direction:
                                                        sortDirection === "asc"
                                                            ? "desc"
                                                            : sortDirection === "desc"
                                                              ? "asc"
                                                              : (column.defaultSortDirection ?? "asc"),
                                                })
                                            }
                                        >
                                            <span className="truncate">{column.header}</span>
                                            <SortIcon
                                                aria-hidden="true"
                                                className={cn("size-3.5 shrink-0", !sortDirection && "opacity-50")}
                                            />
                                        </button>
                                    ) : (
                                        column.header
                                    )}
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
                            <TableCell colSpan={columns.length} className="py-6 text-muted-foreground">
                                {/* Centrato nella parte visibile, non su tutta la tabella: con le
                                    colonne già misurate la tabella resta più larga del contenitore
                                    e `text-center` metteva il messaggio fuori dallo schermo.
                                    `left-1/2` di un elemento sticky si riferisce all'area che
                                    scorre, e la traslazione lo riporta indietro di mezza larghezza. */}
                                <span className="sticky left-1/2 inline-block -translate-x-1/2">{emptyMessage}</span>
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => {
                            const rowKey = getRowKey(row);

                            return (
                                <EntityTableRow
                                    key={rowKey}
                                    row={row}
                                    rowKey={rowKey}
                                    columns={columns}
                                    isResizable={isResizable}
                                    getRowStatusColor={getRowStatusColor}
                                    onRowOpen={onRowOpen}
                                    renderRowActions={renderRowActions}
                                />
                            );
                        })
                    )}
                </TableBody>
            </Table>

            <EntityCardList
                className={cn("sm:hidden", isRefetching && "opacity-60 transition-opacity")}
                columns={cardColumns}
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
