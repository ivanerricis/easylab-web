import EntityTable, { type EntityColumn } from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import { Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
    /**
     * L'indirizzo della scheda di una riga. Presente solo per le entità che ne hanno una
     * (tecnici, collaboratori): un indirizzo e non una funzione da chiamare, perché "Apri" è
     * un link (vedi `OpenEntityButton`).
     */
    getOpenPath?: (id: number) => string;
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
    getOpenPath,
    onDelete,
    onEdit,
    isRowLocked,
    isInitialLoading,
    isRefetching,
    skeletonRowCount,
}: EntityCrudTableProps<TRow>) => {
    const navigate = useNavigate();

    const renderRowActions = (row: TRow) => (
        <>
            {getOpenPath ? (
                <OpenEntityButton size="lg" to={getOpenPath(row.id)} aria-label={`Apri ${entityLabel} ${row.id}`} />
            ) : null}
            {isRowLocked?.(row) ? null : (
                <>
                    <TableActionButton
                        variant="default"
                        size="icon-lg"
                        className="bg-muted hover:bg-primary/20"
                        onClick={() => onEdit(row.id)}
                        aria-label={`Modifica ${entityLabel} ${row.id}`}
                    >
                        <Pencil className="size-5 text-muted-foreground transition-colors group-hover/button:text-primary" />
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
            // apre con il pulsante "Apri", che c'è esattamente quando c'è `getOpenPath`.
            onRowOpen={getOpenPath ? (row) => void navigate(getOpenPath(row.id)) : undefined}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            skeletonRowCount={skeletonRowCount}
        />
    );
};

export default EntityCrudTable;
