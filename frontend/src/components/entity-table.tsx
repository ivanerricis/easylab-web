import EntityCardList, { LoadErrorState, type EntityCardSlot } from "@/components/entity-card-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useListScrollRestoration } from "@/hooks/useListScrollRestoration";
import { withoutLockedColumns } from "@/hooks/useHiddenColumns";
import { useProgressiveRows } from "@/hooks/useProgressiveRows";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import type { SortDirection, TableSort } from "@/lib/tableSort";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { memo, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

export type EntityColumn<TRow> = {
    /** `"actions"` è speciale: quella colonna ospita i pulsanti di riga, non un valore. */
    key: string;
    header: string;
    className?: string;
    render: (row: TRow) => ReactNode;
    /** Dove va la colonna nella scheda su mobile: vedi `EntityCardSlot`. */
    cardSlot?: EntityCardSlot;
    /** Nella scheda su mobile si vede solo aprendola: vedi `EntityCardColumn`. */
    cardCollapsed?: boolean;
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
    /**
     * Nascosta finché l'utente non sceglie diversamente dal menu "Colonne": chi ha già una scelta
     * salvata per la tabella la mantiene.
     */
    hiddenByDefault?: boolean;
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
    /**
     * Il messaggio dell'ultimo caricamento fallito: l'`error` di `usePaginatedRows` /
     * `useSearchableRows`. Senza righe va al posto di `emptyMessage`, con un pulsante "Riprova"
     * che chiama `onRetry` (di norma la `reload` dello stesso hook): una lista che non si è
     * potuta leggere non deve dire "Nessun … disponibile.".
     *
     * Con delle righe già in tabella (una ricarica fallita) le righe restano e basta il toast:
     * sostituirle con l'errore toglierebbe dati ancora validi a chi li stava leggendo.
     * Facoltative: senza, la tabella si comporta come prima.
     */
    loadError?: string | null;
    onRetry?: () => void;
    /** I pulsanti di riga, nella colonna `actions`. Facoltativi: la riga si apre da sé (`onRowOpen`). */
    renderRowActions?: (row: TRow) => ReactNode;
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
     * Apre la scheda della riga: doppio click su desktop, Invio con la riga a fuoco, tap sulla
     * scheda su mobile. Non c'è più un pulsante "Apri" tra le azioni.
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
    /**
     * Con questa le intestazioni (tranne `actions`) si trascinano per riordinare le colonne.
     * `columns` deve arrivare già nell'ordine voluto (di norma da `useColumnOrder`): qui si
     * dice solo dove l'utente ha rilasciato. `toIndex` è la posizione finale della colonna
     * nell'elenco completo, nascoste comprese, non fra le sole visibili: così il risultato
     * coincide con quello del menu "Colonne". Facoltativa: senza, le intestazioni restano ferme.
     */
    onColumnMove?: (key: string, toIndex: number) => void;
};

/** Dove cade il rilascio rispetto alla colonna sotto il puntatore. */
type ColumnDropTarget = { key: string; side: "before" | "after" };

/**
 * La linea di rilascio nel corpo della tabella, lungo tutta la colonna di destinazione.
 *
 * Solo sull'intestazione era un segno di pochi pixel, sul fondo scuro: trascinando non si vedeva.
 * Una regola CSS con `:nth-child` evita di passare il bersaglio alle righe, che sono in `memo` e
 * con "Tutte" possono essere migliaia: così durante il trascinamento non se ne ridisegna nessuna.
 */
const columnDropLineCss = (tableId: string, columnIndex: number, side: ColumnDropTarget["side"]) => {
    if (columnIndex < 0) {
        return "";
    }

    const shadow = side === "before" ? "inset 4px 0 0 0" : "inset -4px 0 0 0";

    return `[data-column-drag-table="${tableId}"] tbody tr > :nth-child(${columnIndex + 1}) { box-shadow: ${shadow} var(--color-focus-ring); }`;
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
    renderRowActions?: (row: TRow) => ReactNode;
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
    const actionsNode = useMemo(() => renderRowActions?.(row), [row]);

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

    // Senza più il pulsante "Apri" la riga è l'unico punto d'ingresso: da tastiera ci si arriva
    // con Tab e si apre con Invio. Solo se il focus è sulla riga stessa, non su un suo pulsante.
    // La cella che prende il colore di stato (vedi `[data-status-cell]` in index.css): l'ID
    // ovunque sia stato spostato, e la prima colonna solo se l'ID non c'è o è nascosto.
    const statusCellKey = columns.some((column) => column.key === idColumnKey) ? idColumnKey : columns[0]?.key;

    const handleRowKeyDown = onRowOpen
        ? (event: React.KeyboardEvent<HTMLTableRowElement>) => {
              if (event.key === "Enter" && event.target === event.currentTarget) {
                  onRowOpen(row);
              }
          }
        : undefined;

    return (
        <TableRow
            data-status-color={statusColor}
            className={
                onRowOpen
                    ? "cursor-pointer select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    : undefined
            }
            tabIndex={onRowOpen ? 0 : undefined}
            onDoubleClick={handleRowDoubleClick}
            onKeyDown={handleRowKeyDown}
        >
            {columns.map((column) => (
                <TableCell
                    key={`${rowKey}-${column.key}`}
                    data-status-cell={statusColor && column.key === statusCellKey ? "" : undefined}
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
    rows: allRows,
    getRowKey,
    emptyMessage,
    loadError,
    onRetry,
    renderRowActions,
    getRowStatusColor,
    onRowOpen,
    isInitialLoading = false,
    isRefetching = false,
    skeletonRowCount = 5,
    sort,
    onSortChange,
    hiddenColumnKeys,
    onColumnMove,
}: EntityTableProps<TRow>) => {
    const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<ColumnDropTarget | null>(null);
    // Il trascinamento non deve partire dalla maniglia di ridimensionamento: `dragstart` non dice
    // da quale figlio del `th` è nato il gesto, lo si ricorda dal `mousedown` che lo precede.
    const pressStartedOnResizeHandleRef = useRef(false);
    const dragTableId = useId();

    const columns = useMemo(() => {
        // Una colonna non nascondibile si disegna anche se le preferenze salvate la dicono
        // nascosta (l'utente l'aveva tolta prima che diventasse bloccata): vedi
        // `withoutLockedColumns`.
        // Senza menu "Colonne" (`hiddenColumnKeys` assente: le tabelle delle schede) valgono i
        // predefiniti della colonna.
        const requestedHiddenKeys =
            hiddenColumnKeys ?? allColumns.filter((column) => column.hiddenByDefault).map((column) => column.key);
        const effectiveHiddenKeys = requestedHiddenKeys.length
            ? withoutLockedColumns(requestedHiddenKeys, allColumns)
            : [];

        return effectiveHiddenKeys.length
            ? allColumns.filter((column) => !effectiveHiddenKeys.includes(column.key))
            : allColumns;
    }, [allColumns, hiddenColumnKeys]);
    const columnKeys = useMemo(() => columns.map((column) => column.key), [columns]);
    // Le schede su mobile mostrano tutte le colonne tranne le azioni, senza il filtro del menu
    // "Colonne" (vedi il commento sulla prop `hiddenColumnKeys`): un `useMemo` a parte, e non
    // un `.filter` dentro il JSX, perché altrimenti ogni render di `EntityTable` produceva un
    // array nuovo e invalidava da solo il `memo` di ogni scheda più sotto.
    const cardColumns = useMemo(() => allColumns.filter((column) => column.key !== actionsColumnKey), [allColumns]);
    // Le righe si disegnano a blocchi mentre si scorre: con "Tutte" sono fino a 5000. Un'unica
    // sentinella sta sotto tabella e schede (una delle due è sempre nascosta e senza layout).
    const {
        visibleRows: rows,
        hasMore,
        sentinelRef,
    } = useProgressiveRows({
        rows: allRows,
        tableKey,
        resetKey: allRows.length > 0 ? getRowKey(allRows[0]) : null,
    });
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

    const clearColumnDrag = () => {
        setDraggedColumnKey(null);
        setDropTarget(null);
    };

    const getDropSide = (event: DragEvent<HTMLElement>): ColumnDropTarget["side"] => {
        const rect = event.currentTarget.getBoundingClientRect();

        return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    };

    const handleColumnDrop = (event: DragEvent<HTMLElement>, targetKey: string) => {
        event.preventDefault();

        const side = getDropSide(event);
        const fromIndex = allColumns.findIndex((column) => column.key === draggedColumnKey);
        const targetIndex = allColumns.findIndex((column) => column.key === targetKey);

        clearColumnDrag();

        if (!onColumnMove || fromIndex === -1 || targetIndex === -1) {
            return;
        }

        // Punto di inserimento nell'elenco completo, poi corretto perché togliere la colonna
        // dalla sua posizione fa scalare di uno tutto ciò che sta dopo.
        const insertionIndex = side === "before" ? targetIndex : targetIndex + 1;
        const toIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;

        if (toIndex !== fromIndex) {
            onColumnMove(allColumns[fromIndex].key, toIndex);
        }
    };

    return (
        <>
            {dropTarget ? (
                <style>
                    {columnDropLineCss(
                        dragTableId,
                        columns.findIndex((column) => column.key === dropTarget.key),
                        dropTarget.side
                    )}
                </style>
            ) : null}
            <Table
                ref={tableRef}
                data-column-drag-table={onColumnMove ? dragTableId : undefined}
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

                            const isDraggable = onColumnMove != null && column.key !== actionsColumnKey;
                            // Il bordo evidenziato dice dove atterrerà la colonna: a sinistra o a
                            // destra di quella sotto il puntatore.
                            const dropSide = dropTarget?.key === column.key ? dropTarget.side : undefined;

                            return (
                                <TableHead
                                    key={column.key}
                                    draggable={isDraggable || undefined}
                                    data-dragging={draggedColumnKey === column.key || undefined}
                                    data-drop-side={dropSide}
                                    onMouseDown={
                                        isDraggable
                                            ? (event) => {
                                                  pressStartedOnResizeHandleRef.current =
                                                      event.target instanceof Element &&
                                                      event.target.closest("[data-column-resize-handle]") != null;
                                              }
                                            : undefined
                                    }
                                    onDragStart={
                                        isDraggable
                                            ? (event) => {
                                                  if (pressStartedOnResizeHandleRef.current) {
                                                      event.preventDefault();
                                                      return;
                                                  }

                                                  // Firefox non avvia il trascinamento senza dati.
                                                  event.dataTransfer?.setData("text/plain", column.key);

                                                  if (event.dataTransfer) {
                                                      event.dataTransfer.effectAllowed = "move";
                                                  }

                                                  setDraggedColumnKey(column.key);
                                              }
                                            : undefined
                                    }
                                    onDragOver={
                                        isDraggable
                                            ? (event) => {
                                                  if (draggedColumnKey == null) {
                                                      return;
                                                  }

                                                  // Senza `preventDefault` il browser non accetta il rilascio.
                                                  event.preventDefault();

                                                  const side = getDropSide(event);

                                                  setDropTarget((current) =>
                                                      current?.key === column.key && current.side === side
                                                          ? current
                                                          : { key: column.key, side }
                                                  );
                                              }
                                            : undefined
                                    }
                                    onDragLeave={
                                        isDraggable
                                            ? (event) => {
                                                  // Passare su un figlio (il titolo) non è uscire dalla colonna.
                                                  if (
                                                      !event.currentTarget.contains(event.relatedTarget as Node | null)
                                                  ) {
                                                      setDropTarget((current) =>
                                                          current?.key === column.key ? null : current
                                                      );
                                                  }
                                              }
                                            : undefined
                                    }
                                    onDrop={
                                        isDraggable && draggedColumnKey != null
                                            ? (event) => handleColumnDrop(event, column.key)
                                            : undefined
                                    }
                                    onDragEnd={isDraggable ? clearColumnDrag : undefined}
                                    // `aria-sort` sulla colonna ordinata: è ciò che fa dire a uno
                                    // screen reader "ordinata in modo crescente" arrivando lì.
                                    aria-sort={sortDirection ? ariaSortValue[sortDirection] : undefined}
                                    className={cn(
                                        "relative",
                                        isDraggable && "cursor-grab",
                                        draggedColumnKey === column.key && "opacity-50",
                                        // Nell'intestazione il bordo usa il colore del suo testo, l'unico
                                        // che si legge sul fondo in qualunque tema, e la colonna di
                                        // destinazione si schiarisce; nel corpo prosegue la linea di
                                        // `columnDropLineCss`.
                                        dropSide && "bg-white/20",
                                        dropSide === "before" &&
                                            "shadow-[inset_4px_0_0_0_var(--color-table-header-foreground)]",
                                        dropSide === "after" &&
                                            "shadow-[inset_-4px_0_0_0_var(--color-table-header-foreground)]",
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
                                        // Il focus è la linea di tutti i controlli (`focus-outline`):
                                        // prima c'era solo uno sfondo appena più chiaro, che da
                                        // tastiera non si vedeva. Disegnata all'interno
                                        // (`-outline-offset-2`, con `!` per vincere lo stacco di
                                        // 2px della ricetta a pari specificità) per lo stesso
                                        // `overflow: hidden` che taglierebbe una linea esterna.
                                        <span
                                            {...resizeHandleProps}
                                            data-column-resize-handle=""
                                            className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none focus-outline transition-colors outline-none select-none hover:bg-background/40 focus-visible:bg-background/60 focus-visible:-outline-offset-2!"
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
                                <span className="sticky left-1/2 inline-block -translate-x-1/2">
                                    {loadError ? (
                                        <LoadErrorState message={loadError} onRetry={onRetry} />
                                    ) : (
                                        emptyMessage
                                    )}
                                </span>
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
                onRowOpen={onRowOpen}
                emptyMessage={emptyMessage}
                loadError={loadError}
                onRetry={onRetry}
                isInitialLoading={isInitialLoading}
                skeletonCardCount={Math.min(visibleSkeletonRows, 4)}
            />

            {hasMore ? <div ref={sentinelRef} aria-hidden="true" className="h-px" /> : null}
        </>
    );
};

export default EntityTable;
