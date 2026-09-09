import { listCustomers } from "@/lib/api";
import type { CustomerDto } from "@/types/dtos";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import type { CustomerSortOption } from "../components/types";

type UseCustomersRowsParams = {
    searchText: string;
    sortOption: CustomerSortOption;
    currentPage: number;
    pageSize: number;
};

export const useCustomersRows = ({ searchText, sortOption, currentPage, pageSize }: UseCustomersRowsParams) => {
    const debouncedSearchText = useDebouncedValue(searchText);
    const [sortBy, sortOrder] = sortOption.split(":") as ["createdAt" | "name", "asc" | "desc"];
    const { rows, totalItems, totalPages, isLoading, reload } = usePaginatedRows<CustomerDto>({
        fetchRows: (signal) =>
            listCustomers({ page: currentPage, pageSize, search: debouncedSearchText, sortBy, sortOrder, signal }),
        queryKey: [currentPage, pageSize, debouncedSearchText, sortOption],
        errorMessage: "Impossibile caricare i clienti",
    });

    return {
        customerRows: rows,
        totalItems,
        totalPages,
        isLoading,
        loadCustomers: reload,
    };
};
