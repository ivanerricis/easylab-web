import EntityTable from "@/components/entity-table";
import TableActionButton from "@/components/table-action-button";
import type { CustomerDto } from "@/types/dtos";
import { ClipboardList, HardHat, Pencil, Printer, Trash2 } from "lucide-react";
import type { CustomerColumn } from "./customer-columns";

type CustomersTableProps = {
    columns: CustomerColumn[];
    rows: CustomerDto[];
    onOpenCustomerReports: (id: number) => void;
    onOpenCustomerInterventions: (id: number) => void;
    onPrintCustomerReports: (id: number) => void;
    onPrintCustomerInterventions: (id: number) => void;
    onEditCustomer: (id: number) => void;
    onDeleteCustomer: (customer: CustomerDto) => void;
};

const CustomersTable = ({
    columns,
    rows,
    onOpenCustomerReports,
    onOpenCustomerInterventions,
    onPrintCustomerReports,
    onPrintCustomerInterventions,
    onEditCustomer,
    onDeleteCustomer,
}: CustomersTableProps) => {
    const renderRowActions = (row: CustomerDto) => (
        <>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-yellow-400/20 hover:bg-yellow-400/30"
                onClick={() => onOpenCustomerReports(row.id)}
                aria-label={`Apri report cliente ${row.id}`}
            >
                <ClipboardList className="size-5 text-yellow-400" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-sky-400/20 hover:bg-sky-400/30"
                onClick={() => onOpenCustomerInterventions(row.id)}
                aria-label={`Apri interventi cliente ${row.id}`}
            >
                <HardHat className="size-5 text-sky-500" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-yellow-400/20 hover:bg-yellow-400/30"
                onClick={() => onPrintCustomerReports(row.id)}
                aria-label={`Stampa resoconto report cliente ${row.id}`}
            >
                <Printer className="size-5 text-yellow-400" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-sky-400/20 hover:bg-sky-400/30"
                onClick={() => onPrintCustomerInterventions(row.id)}
                aria-label={`Stampa resoconto interventi cliente ${row.id}`}
            >
                <Printer className="size-5 text-sky-500" />
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
        />
    );
};

export default CustomersTable;
