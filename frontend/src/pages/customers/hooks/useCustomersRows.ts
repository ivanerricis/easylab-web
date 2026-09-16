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
};

export const useCustomersRows = ({ searchText, sortOption, currentPage, pageSize }: UseCustomersRowsParams) => {
    const [sortBy, sortOrder] = sortOption.split(":") as ["createdAt" | "name", "asc" | "desc"];
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, reload } =
        usePaginatedRows<CustomerDto>({
            fetchRows: (signal) =>
                listCustomers({ page: currentPage, pageSize, search: searchText, sortBy, sortOrder, signal }),
            queryKey: [currentPage, pageSize, searchText, sortOption],
            errorMessage: "Impossibile caricare i clienti",
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
