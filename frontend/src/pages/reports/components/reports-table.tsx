import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import type { ReportDto } from "@/types/dtos";
import { Pencil, Printer, Trash2 } from "lucide-react";
import type { ReportColumn } from "./report-columns";

type ReportsTableProps = {
    columns: ReportColumn[];
    rows: ReportDto[];
    onOpenReport: (id: number) => void;
    onEditReport: (id: number) => void;
    onPrintReport: (id: number) => void;
    onDeleteReport: (report: ReportDto) => void;
    /** Stati di caricamento della lista: vedi `EntityTable`. */
    isInitialLoading?: boolean;
    isRefetching?: boolean;
    skeletonRowCount?: number;
};

// Sfondo e testo li decide index.css in base a data-status-color e all'intensità scelta
// in Impostazioni > Tema; la cella azioni torna a bg-background/text-foreground per non
// colorare le icone dei pulsanti.
const getStatusColor = (row: ReportDto) => (row.closed ? "green" : "red");

const ReportsTable = ({
    columns,
    rows,
    onOpenReport,
    onEditReport,
    onPrintReport,
    onDeleteReport,
    isInitialLoading,
    isRefetching,
    skeletonRowCount,
}: ReportsTableProps) => {
    const renderRowActions = (row: ReportDto) => (
        <>
            <OpenEntityButton
                size="icon-lg"
                onClick={() => onOpenReport(row.id)}
                aria-label={`Apri report ${row.id}`}
            />
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-primary/10 hover:bg-primary/20"
                onClick={() => onEditReport(row.id)}
                aria-label={`Modifica report ${row.id}`}
            >
                <Pencil className="size-5 text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-action-print/20 hover:bg-action-print/30"
                onClick={() => onPrintReport(row.id)}
                aria-label={`Stampa report ${row.id}`}
            >
                <Printer className="size-5 text-action-print" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => onDeleteReport(row)}
                aria-label={`Elimina report ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

    return (
        <EntityTable
            tableKey="reports"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun report disponibile."
            renderRowActions={renderRowActions}
            getRowStatusColor={getStatusColor}
            onRowOpen={(row) => onOpenReport(row.id)}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            skeletonRowCount={skeletonRowCount}
        />
    );
};

export default ReportsTable;
