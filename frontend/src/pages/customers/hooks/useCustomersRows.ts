import { listCustomers } from "@/lib/api";
import type { CustomerSortBy } from "@/lib/api/customers";
import { parseSortParams } from "@/lib/tableSort";
import type { CustomerDto } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { DEFAULT_CUSTOMER_SORT_OPTION } from "../components/types";
import type { CustomerSortOption } from "../components/types";

/** I campi per cui l'API dei clienti sa ordinare: vedi `parseSortOption`. */
const CUSTOMER_SORT_FIELDS: Record<CustomerSortBy, true> = { createdAt: true, name: true };

type UseCustomersRowsParams = {
    /** Già rallentato dal chiamante (vedi `useUrlSearchText`): qui si cerca subito. */
    searchText: string;
    sortOption: CustomerSortOption;
    currentPage: number;
    pageSize: number;
    /** Chiamato con l'ultima pagina valida quando `currentPage` la supera. Vedi `usePaginatedRows`. */
    onPageOutOfRange?: (lastPage: number) => void;
};

export const useCustomersRows = ({
    searchText,
    sortOption,
    currentPage,
    pageSize,
    onPageOutOfRange,
}: UseCustomersRowsParams) => {
    const { sortBy, sortOrder } = parseSortParams(sortOption, CUSTOMER_SORT_FIELDS, DEFAULT_CUSTOMER_SORT_OPTION);
    const params = { page: currentPage, pageSize, search: searchText, sortBy, sortOrder };
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, error, reload } =
        usePaginatedRows<CustomerDto>({
            fetchRows: (signal) => listCustomers({ ...params, signal }),
            // Costruita dagli stessi parametri della richiesta: vedi `useReportsRows`.
            queryKey: Object.values(params),
            errorMessage: "Impossibile caricare i clienti",
            page: currentPage,
            onPageOutOfRange,
        });

    return {
        customerRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        /** L'ultimo caricamento fallito, per la tabella ("Riprova"): vedi `error` in `usePaginatedRows`. */
        loadError: error,
        loadCustomers: reload,
    };
};
