import EntityTable, { type EntityColumn } from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import { Pencil, Trash2 } from "lucide-react";

type EntityCrudTableProps<TRow extends { id: number }> = {
    tableKey: string;
    columns: EntityColumn<TRow>[];
    rows: TRow[];
    emptyMessage: string;
    /**
     * Il nome dell'entità al singolare, usato solo per le etichette di accessibilità
     * ("Modifica tecnico 12"): sono l'unico testo che cambia fra un'entità e l'altra qui
     * dentro, ed è testo che va detto per esteso perché chi usa uno screen reader sente il
     * pulsante fuori dal contesto della riga.
     */
    entityLabel: string;
    /** Presente solo per le entità che hanno una scheda propria (tecnici, collaboratori). */
    onOpen?: (id: number) => void;
    /**
     * Righe che non si possono modificare né eliminare: i pulsanti spariscono invece di
     * restare lì a raccogliere un rifiuto del server. "Apri", quando c'è, resta.
     */
    isRowLocked?: (row: TRow) => boolean;
    onEdit: (id: number) => void;
    onDelete: (row: TRow) => void;
    /** Stati di caricamento della lista: vedi `EntityTable`. */
    isInitialLoading?: boolean;
    isRefetching?: boolean;
    skeletonRowCount?: number;
};

/**
 * La tabella delle entità di anagrafica, con i tre pulsanti di riga.
 *
 * `EntityTable` aveva già unificato la tabella vera e propria, ma i pulsanti erano rimasti
 * al chiamante — scelta giusta allora, perché clienti e report ne hanno di davvero diversi.
 * Le quattro anagrafiche (tecnici, collaboratori, dispositivi, difetti) però avevano gli
 * stessi tre, in quattro copie identiche a meno del nome nell'`aria-label`, del `tableKey` e
 * del messaggio di lista vuota. Quelle quattro copie sono questo file; report, interventi e
 * clienti continuano a passare da `EntityTable` con i propri.
 */
const EntityCrudTable = <TRow extends { id: number }>({
    tableKey,
    columns,
    rows,
    emptyMessage,
    entityLabel,
    onOpen,
    onDelete,
    onEdit,
    isRowLocked,
    isInitialLoading,
    isRefetching,
    skeletonRowCount,
}: EntityCrudTableProps<TRow>) => {
    const renderRowActions = (row: TRow) => (
        <>
            {onOpen ? (
                <OpenEntityButton
                    size="lg"
                    onClick={() => onOpen(row.id)}
                    aria-label={`Apri ${entityLabel} ${row.id}`}
                />
            ) : null}
            {isRowLocked?.(row) ? null : (
                <>
                    <TableActionButton
                        variant="default"
                        size="icon-lg"
                        className="bg-primary/10 hover:bg-primary/20"
                        onClick={() => onEdit(row.id)}
                        aria-label={`Modifica ${entityLabel} ${row.id}`}
                    >
                        <Pencil className="size-5 text-primary" />
                    </TableActionButton>
                    <TableActionButton
                        variant="destructive"
                        size="icon-lg"
                        onClick={() => onDelete(row)}
                        aria-label={`Elimina ${entityLabel} ${row.id}`}
                    >
                        <Trash2 className="size-5" />
                    </TableActionButton>
                </>
            )}
        </>
    );

    return (
        <EntityTable
            tableKey={tableKey}
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage={emptyMessage}
            renderRowActions={renderRowActions}
            // Il doppio click sulla riga apriva la scheda su report e interventi ma non qui,
            // perché questo componente non inoltrava `onRowOpen`: lo stesso gesto funzionava su
            // due tabelle su sette. Resta un'aggiunta per il mouse — da tastiera la scheda si
            // apre con il pulsante "Apri", che c'è esattamente quando c'è `onOpen`.
            onRowOpen={onOpen ? (row) => onOpen(row.id) : undefined}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            skeletonRowCount={skeletonRowCount}
        />
    );
};

export default EntityCrudTable;
