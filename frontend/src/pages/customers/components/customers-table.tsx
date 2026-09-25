import EntityTable from "@/components/entity-table";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
import type { TableSort } from "@/lib/tableSort";
import OpenEntityButton from "@/components/open-entity-button";
import { entityPaths } from "@/lib/entityPaths";
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
    /** Ordinamento dalle intestazioni e colonne nascoste: vedi `EntityTable`. */
    sort?: TableSort;
    onSortChange?: (sort: TableSort) => void;
    hiddenColumnKeys?: readonly string[];
    /** La ricerca in vigore, per dire perché la lista è vuota: vedi `resolveEmptyListMessage`. */
    searchText?: string;
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
    sort,
    onSortChange,
    hiddenColumnKeys,
    searchText,
}: CustomersTableProps) => {
    const renderRowActions = (row: CustomerDto) => (
        <>
            <OpenEntityButton size="icon-lg" to={entityPaths.customer(row.id)} aria-label={`Apri cliente ${row.id}`} />
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-muted hover:bg-action-print/20"
                onClick={() => onPrintCustomer(row.id)}
                aria-label={`Stampa resoconto cliente ${row.id}`}
            >
                <Printer className="size-5 text-muted-foreground transition-colors group-hover/button:text-action-print" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-muted hover:bg-primary/20"
                onClick={() => onEditCustomer(row.id)}
                aria-label={`Modifica cliente ${row.id}`}
            >
                <Pencil className="size-5 text-muted-foreground transition-colors group-hover/button:text-primary" />
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
            emptyMessage={resolveEmptyListMessage({ emptyMessage: "Nessun cliente disponibile.", searchText })}
            renderRowActions={renderRowActions}
            onRowOpen={(row) => onOpenCustomer(row.id)}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            skeletonRowCount={skeletonRowCount}
            sort={sort}
            onSortChange={onSortChange}
            hiddenColumnKeys={hiddenColumnKeys}
        />
    );
};

export default CustomersTable;
