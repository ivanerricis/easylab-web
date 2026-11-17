import EntityTable from "@/components/entity-table";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
import type { TableSort } from "@/lib/tableSort";
import { interventionStatusColor } from "@/lib/interventions";
import type { InterventionDto } from "@/types/dtos";
import type { ReactNode } from "react";
import type { InterventionColumn } from "./intervention-columns";

type InterventionsTableProps = {
    columns: InterventionColumn[];
    rows: InterventionDto[];
    onOpenIntervention: (id: number) => void;
    /** I pulsanti di riga: vedi `useInterventionRowActions`, condiviso con le schede. */
    renderRowActions: (intervention: InterventionDto) => ReactNode;
    /** Stati di caricamento della lista: vedi `EntityTable`. */
    isInitialLoading?: boolean;
    isRefetching?: boolean;
    /**
     * L'ultimo caricamento fallito e come riprovarlo: senza righe la tabella mostra l'errore
     * con "Riprova" invece del messaggio di lista vuota. Vedi `loadError` in `EntityTable`.
     */
    loadError?: string | null;
    onRetry?: () => void;
    skeletonRowCount?: number;
    /** Ordinamento dalle intestazioni e colonne nascoste: vedi `EntityTable`. */
    sort?: TableSort;
    onSortChange?: (sort: TableSort) => void;
    hiddenColumnKeys?: readonly string[];
    /** Riordino delle colonne trascinando l'intestazione: vedi `EntityTable`. */
    onColumnMove?: (key: string, toIndex: number) => void;
    /**
     * Ricerca e filtri in vigore, per dire perché la lista è vuota: vedi
     * `resolveEmptyListMessage`.
     */
    searchText?: string;
    hasActiveFilters?: boolean;
};

// Sfondo e testo li decide index.css in base a data-status-color e all'intensità scelta
// in Impostazioni > Tema; la cella azioni torna a bg-card/text-foreground per non
// colorare le icone dei pulsanti. La corrispondenza stato -> colore sta in lib/interventions,
// condivisa con le altre liste di interventi.

const InterventionsTable = ({
    columns,
    rows,
    onOpenIntervention,
    renderRowActions,
    isInitialLoading,
    isRefetching,
    loadError,
    onRetry,
    skeletonRowCount,
    sort,
    onSortChange,
    hiddenColumnKeys,
    onColumnMove,
    searchText,
    hasActiveFilters,
}: InterventionsTableProps) => {
    return (
        <EntityTable
            tableKey="interventions"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage={resolveEmptyListMessage({
                emptyMessage: "Nessun intervento disponibile.",
                searchText,
                hasActiveFilters,
                filteredMessage: "Nessun intervento corrisponde ai filtri.",
            })}
            renderRowActions={renderRowActions}
            getRowStatusColor={(row) => interventionStatusColor[row.status]}
            onRowOpen={(row) => onOpenIntervention(row.id)}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            loadError={loadError}
            onRetry={onRetry}
            skeletonRowCount={skeletonRowCount}
            sort={sort}
            onSortChange={onSortChange}
            hiddenColumnKeys={hiddenColumnKeys}
            onColumnMove={onColumnMove}
        />
    );
};

export default InterventionsTable;
