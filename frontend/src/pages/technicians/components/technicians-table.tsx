import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import type { TechnicianDto } from "@/types/dtos";
import { Pencil, Trash2 } from "lucide-react";
import type { TechnicianColumn } from "./technician-columns";

type TechniciansTableProps = {
    columns: TechnicianColumn[];
    rows: TechnicianDto[];
    onOpenTechnician: (id: number) => void;
    onEditTechnician: (id: number) => void;
    onDeleteTechnician: (technician: TechnicianDto) => void;
};

const TechniciansTable = ({
    columns,
    rows,
    onOpenTechnician,
    onEditTechnician,
    onDeleteTechnician,
}: TechniciansTableProps) => {
    const renderRowActions = (row: TechnicianDto) => (
        <>
            <OpenEntityButton
                size="lg"
                onClick={() => onOpenTechnician(row.id)}
                aria-label={`Apri tecnico ${row.id}`}
            />
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-primary/10 hover:bg-primary/20"
                onClick={() => onEditTechnician(row.id)}
                aria-label={`Modifica tecnico ${row.id}`}
            >
                <Pencil className="size-5 text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => onDeleteTechnician(row)}
                aria-label={`Elimina tecnico ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

    return (
        <EntityTable
            tableKey="technicians"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun tecnico disponibile."
            renderRowActions={renderRowActions}
        />
    );
};

export default TechniciansTable;
