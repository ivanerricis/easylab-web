import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import { interventionStatusColor } from "@/lib/interventions";
import type { InterventionDto } from "@/types/dtos";
import { Mail, Pencil, Printer, Trash2 } from "lucide-react";
import type { InterventionColumn } from "./intervention-columns";

type InterventionsTableProps = {
    columns: InterventionColumn[];
    rows: InterventionDto[];
    onOpenIntervention: (id: number) => void;
    onEditIntervention: (id: number) => void;
    onPrintIntervention: (id: number) => void;
    onSendEmailIntervention: (id: number) => void;
    onDeleteIntervention: (intervention: InterventionDto) => void;
    /** Stati di caricamento della lista: vedi `EntityTable`. */
    isInitialLoading?: boolean;
    isRefetching?: boolean;
    skeletonRowCount?: number;
};

// Sfondo e testo li decide index.css in base a data-status-color e all'intensità scelta
// in Impostazioni > Tema; la cella azioni torna a bg-background/text-foreground per non
// colorare le icone dei pulsanti. La corrispondenza stato -> colore sta in lib/interventions,
// condivisa con le altre liste di interventi.

const InterventionsTable = ({
    columns,
    rows,
    onOpenIntervention,
    onEditIntervention,
    onPrintIntervention,
    onSendEmailIntervention,
    onDeleteIntervention,
    isInitialLoading,
    isRefetching,
    skeletonRowCount,
}: InterventionsTableProps) => {
    const renderRowActions = (row: InterventionDto) => (
        <>
            <OpenEntityButton
                size="icon-lg"
                onClick={() => onOpenIntervention(row.id)}
                aria-label={`Apri intervento ${row.id}`}
            />
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-primary/10 hover:bg-primary/20"
                onClick={() => onEditIntervention(row.id)}
                aria-label={`Modifica intervento ${row.id}`}
            >
                <Pencil className="size-5 text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-action-print/20 hover:bg-action-print/30"
                onClick={() => onPrintIntervention(row.id)}
                aria-label={`Stampa intervento ${row.id}`}
            >
                <Printer className="size-5 text-action-print" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-action-email/20 hover:bg-action-email/30"
                onClick={() => onSendEmailIntervention(row.id)}
                aria-label={`Invia email intervento ${row.id}`}
            >
                <Mail className="size-5 text-action-email" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => onDeleteIntervention(row)}
                aria-label={`Elimina intervento ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

    return (
        <EntityTable
            tableKey="interventions"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun intervento disponibile."
            renderRowActions={renderRowActions}
            getRowStatusColor={(row) => interventionStatusColor[row.status]}
            onRowOpen={(row) => onOpenIntervention(row.id)}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            skeletonRowCount={skeletonRowCount}
        />
    );
};

export default InterventionsTable;
