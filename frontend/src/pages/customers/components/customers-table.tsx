import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import type { CustomerDto } from "@/types/dtos";
import { Pencil, Printer, Trash2 } from "lucide-react";
import type { CustomerColumn } from "./customer-columns";

type CustomersTableProps = {
    columns: CustomerColumn[];
    rows: CustomerDto[];
    onOpenCustomer: (id: number) => void;
    onPrintCustomer: (id: number) => void;
    onEditCustomer: (id: number) => void;
    onDeleteCustomer: (customer: CustomerDto) => void;
    /** Stati di caricamento della lista: vedi `EntityTable`. */
    isInitialLoading?: boolean;
    isRefetching?: boolean;
    skeletonRowCount?: number;
};

const CustomersTable = ({
    columns,
    rows,
    onOpenCustomer,
    onPrintCustomer,
    onEditCustomer,
    onDeleteCustomer,
    isInitialLoading,
    isRefetching,
    skeletonRowCount,
}: CustomersTableProps) => {
    const renderRowActions = (row: CustomerDto) => (
        <>
            <OpenEntityButton
                size="icon-lg"
                onClick={() => onOpenCustomer(row.id)}
                aria-label={`Apri cliente ${row.id}`}
            />
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-action-print/20 hover:bg-action-print/30"
                onClick={() => onPrintCustomer(row.id)}
                aria-label={`Stampa resoconto cliente ${row.id}`}
            >
                <Printer className="size-5 text-action-print" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-primary/10 hover:bg-primary/20"
                onClick={() => onEditCustomer(row.id)}
                aria-label={`Modifica cliente ${row.id}`}
            >
                <Pencil className="size-5 text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => onDeleteCustomer(row)}
                aria-label={`Elimina cliente ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

    return (
        <EntityTable
            tableKey="customers"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage="Nessun cliente disponibile."
            renderRowActions={renderRowActions}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            skeletonRowCount={skeletonRowCount}
        />
    );
};

export default CustomersTable;
