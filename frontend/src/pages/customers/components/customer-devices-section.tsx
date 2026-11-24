import EntityTable, { type EntityColumn } from "@/components/entity-table";
import type { RowAction } from "@/components/row-actions";
import TablePagination from "@/components/table-pagination";
import type { CustomerDevicesList } from "@/hooks/useCustomerDevices";
import { customerDeviceTypeLabels } from "@/lib/customerDevices";
import type { CustomerDeviceDto } from "@/types/dtos";

/** Le colonne della tabella dei dispositivi del cliente (nella sua scheda, quindi senza il cliente). */
const customerDeviceColumns: EntityColumn<CustomerDeviceDto>[] = [
    {
        key: "name",
        header: "Nome",
        hideable: false,
        cardSlot: "title",
        render: (row) => row.name,
    },
    {
        key: "type",
        header: "Tipo",
        cardSlot: "badge",
        render: (row) => customerDeviceTypeLabels[row.type],
    },
    {
        key: "model",
        header: "Marca e modello",
        render: (row) => row.model ?? "-",
    },
    {
        key: "serialNumber",
        header: "Numero di serie",
        render: (row) => row.serialNumber,
    },
    {
        key: "note",
        header: "Note",
        cardSlot: "wide",
        render: (row) => row.note ?? "-",
    },
    {
        key: "actions",
        header: "Azioni",
        className: "text-right",
        render: () => null,
    },
];

type CustomerDevicesTableProps = {
    devices: CustomerDevicesList;
    /** Modifica ed elimina (`useCustomerDeviceRowActions`): pulsanti e menu col tasto destro. */
    getRowActions: (device: CustomerDeviceDto) => RowAction[];
    onEdit: (device: CustomerDeviceDto) => void;
};

/**
 * I dispositivi del cliente nella quarta tab della sua scheda, con l'impaginazione come le altre.
 * "Nuovo dispositivo" sta nel menu "Nuovo" dell'intestazione. Non c'è una pagina del dispositivo:
 * il doppio click sulla riga apre la modifica.
 */
export const CustomerDevicesTable = ({ devices, getRowActions, onEdit }: CustomerDevicesTableProps) => (
    <>
        <div className="min-h-0 flex-1 overflow-auto">
            <EntityTable
                tableKey="customer-devices"
                columns={customerDeviceColumns}
                rows={devices.rows}
                getRowKey={(row) => row.id}
                emptyMessage="Nessun dispositivo associato a questo cliente."
                getRowActions={getRowActions}
                onRowOpen={onEdit}
                isInitialLoading={devices.isInitialLoading}
                isRefetching={devices.isRefetching}
                loadError={devices.error}
                onRetry={() => void devices.reload()}
                skeletonRowCount={devices.pageSize}
            />
        </div>

        <TablePagination
            currentPage={devices.page}
            totalPages={devices.totalPages}
            totalItems={devices.totalItems}
            pageSize={devices.pageSize}
            onPageChange={devices.setPage}
            onPageSizeChange={devices.setPageSize}
        />
    </>
);
