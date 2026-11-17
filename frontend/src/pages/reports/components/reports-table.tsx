import EntityTable from "@/components/entity-table";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
import type { TableSort } from "@/lib/tableSort";
import type { ReportDto } from "@/types/dtos";
import type { ReactNode } from "react";
import type { ReportColumn } from "./report-columns";
import { reportStatusColor } from "@/lib/reports";

type ReportsTableProps = {
    columns: ReportColumn[];
    rows: ReportDto[];
    onOpenReport: (id: number) => void;
    /** I pulsanti di riga (`useReportRowActions`): modifica, stampa, eliminazione. */
    renderRowActions: (report: ReportDto) => ReactNode;
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
// colorare le icone dei pulsanti.
const getStatusColor = (row: ReportDto) => reportStatusColor(row.closed);

const ReportsTable = ({
    columns,
    rows,
    onOpenReport,
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
}: ReportsTableProps) => {
    return (
        <EntityTable
            tableKey="reports"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage={resolveEmptyListMessage({
                emptyMessage: "Nessun report disponibile.",
                searchText,
                hasActiveFilters,
                filteredMessage: "Nessun report corrisponde ai filtri.",
            })}
            renderRowActions={renderRowActions}
            getRowStatusColor={getStatusColor}
            onRowOpen={(row) => onOpenReport(row.id)}
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

export default ReportsTable;
