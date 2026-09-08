import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import type { CollaboratorDto } from "@/types/dtos";
import { Pencil, Trash2 } from "lucide-react";
import type { CollaboratorColumn } from "./collaborator-columns";

type CollaboratorsTableProps = {
    columns: CollaboratorColumn[];
    rows: CollaboratorDto[];
    onOpenCollaborator: (id: number) => void;
    onEditCollaborator: (id: number) => void;
    onDeleteCollaborator: (collaborator: CollaboratorDto) => void;
};

const CollaboratorsTable = ({
    columns,
    rows,
    onOpenCollaborator,
    onEditCollaborator,
    onDeleteCollaborator,
}: CollaboratorsTableProps) => {
    const renderRowActions = (row: CollaboratorDto) => (
        <>
            <OpenEntityButton
                size="lg"
                onClick={() => onOpenCollaborator(row.id)}
                aria-label={`Apri collaboratore ${row.id}`}
            />
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-primary/10 hover:bg-primary/20"
                onClick={() => onEditCollaborator(row.id)}
                aria-label={`Modifica collaboratore ${row.id}`}
            >
                <Pencil className="size-5 text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => onDeleteCollaborator(row)}
                aria-label={`Elimina collaboratore ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

    return (
        <EntityTable
            tableKey="collaborators"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun collaboratore disponibile."
            renderRowActions={renderRowActions}
        />
    );
};

export default CollaboratorsTable;
