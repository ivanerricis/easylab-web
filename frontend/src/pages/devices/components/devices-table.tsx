import EntityTable from "@/components/entity-table";
import TableActionButton from "@/components/table-action-button";
import type { DeviceDto } from "@/types/dtos";
import { Pencil, Trash2 } from "lucide-react";
import type { DeviceColumn } from "./device-columns";

type DevicesTableProps = {
    columns: DeviceColumn[];
    rows: DeviceDto[];
    onEditDevice: (id: number) => void;
    onDeleteDevice: (device: DeviceDto) => void;
};

const DevicesTable = ({ columns, rows, onEditDevice, onDeleteDevice }: DevicesTableProps) => {
    const renderRowActions = (row: DeviceDto) => (
        <>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-primary/10 hover:bg-primary/20"
                onClick={() => onEditDevice(row.id)}
                aria-label={`Modifica dispositivo ${row.id}`}
            >
                <Pencil className="size-5 text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => onDeleteDevice(row)}
                aria-label={`Elimina dispositivo ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

    return (
        <EntityTable
            tableKey="devices"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun dispositivo disponibile."
            renderRowActions={renderRowActions}
        />
    );
};

export default DevicesTable;
