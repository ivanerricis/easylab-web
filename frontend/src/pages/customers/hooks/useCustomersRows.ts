import { listCustomers } from "@/lib/api";
import type { CustomerDto } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import type { CustomerSortOption } from "../components/types";

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
    const [sortBy, sortOrder] = sortOption.split(":") as ["createdAt" | "name", "asc" | "desc"];
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, reload } =
        usePaginatedRows<CustomerDto>({
            fetchRows: (signal) =>
                listCustomers({ page: currentPage, pageSize, search: searchText, sortBy, sortOrder, signal }),
            queryKey: [currentPage, pageSize, searchText, sortOption],
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
        loadCustomers: reload,
    };
};
