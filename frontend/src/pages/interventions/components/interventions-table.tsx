import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
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
};

// Sfondo e testo li decide index.css in base a data-status-color e all'intensità scelta
// in Impostazioni > Tema; la cella azioni torna a bg-background/text-foreground per non
// colorare le icone dei pulsanti.
const statusColorByStatus: Record<InterventionDto["status"], string> = {
    programmato: "red",
    in_lavorazione: "yellow",
    completato: "green",
};

const accentClassNameByStatus: Record<InterventionDto["status"], string> = {
    programmato: "border-t-red-500",
    in_lavorazione: "border-t-yellow-400",
    completato: "border-t-green-500",
};

const InterventionsTable = ({
    columns,
    rows,
    onOpenIntervention,
    onEditIntervention,
    onPrintIntervention,
    onSendEmailIntervention,
    onDeleteIntervention,
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
                className="bg-yellow-400/20 hover:bg-yellow-400/30"
                onClick={() => onPrintIntervention(row.id)}
                aria-label={`Stampa intervento ${row.id}`}
            >
                <Printer className="size-5 text-yellow-400" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-sky-400/20 hover:bg-sky-400/30"
                onClick={() => onSendEmailIntervention(row.id)}
                aria-label={`Invia email intervento ${row.id}`}
            >
                <Mail className="size-5 text-sky-500" />
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
            getRowStatusColor={(row) => statusColorByStatus[row.status]}
            getAccentClassName={(row) => accentClassNameByStatus[row.status]}
            onRowOpen={(row) => onOpenIntervention(row.id)}
        />
    );
};

export default InterventionsTable;
