import EntityTable from "@/components/entity-table";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
import type { TableSort } from "@/lib/tableSort";
import type { RowAction } from "@/components/row-actions";
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
    /**
     * L'ultimo caricamento fallito e come riprovarlo: senza righe la tabella mostra l'errore
     * con "Riprova" invece del messaggio di lista vuota. Vedi `loadError` in `EntityTable`.
     */
    loadError?: string | null;
    onRetry?: () => void;
    skeletonRowCount?: number;
    /** Ordinamento dalle intestazioni e colonne nascoste: vedi `EntityTable`. */
    sort?: TableSort;
    onSortChange?: (sort: TableSort) => void;
    hiddenColumnKeys?: readonly string[];
    /** Riordino delle colonne trascinando l'intestazione: vedi `EntityTable`. */
    onColumnMove?: (key: string, toIndex: number) => void;
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
    loadError,
    onRetry,
    skeletonRowCount,
    sort,
    onSortChange,
    hiddenColumnKeys,
    onColumnMove,
    searchText,
}: CustomersTableProps) => {
    const getRowActions = (row: CustomerDto): RowAction[] => [
        {
            key: "print",
            label: "Stampa resoconto",
            ariaLabel: `Stampa resoconto cliente ${row.id}`,
            icon: Printer,
            tone: "print",
            onSelect: () => onPrintCustomer(row.id),
        },
        {
            key: "edit",
            label: "Modifica",
            ariaLabel: `Modifica cliente ${row.id}`,
            icon: Pencil,
            onSelect: () => onEditCustomer(row.id),
        },
        {
            key: "delete",
            label: "Elimina",
            ariaLabel: `Elimina cliente ${row.id}`,
            icon: Trash2,
            variant: "destructive",
            onSelect: () => onDeleteCustomer(row),
        },
    ];

    return (
        <EntityTable
            tableKey="customers"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyMessage={resolveEmptyListMessage({ emptyMessage: "Nessun cliente disponibile.", searchText })}
            getRowActions={getRowActions}
            onRowOpen={(row) => onOpenCustomer(row.id)}
            isInitialLoading={isInitialLoading}
            isRefetching={isRefetching}
            loadError={loadError}
            onRetry={onRetry}
            skeletonRowCount={skeletonRowCount}
            sort={sort}
            onSortChange={onSortChange}
            hiddenColumnKeys={hiddenColumnKeys}
            onColumnMove={onColumnMove}
        />
    );
};

export default CustomersTable;
