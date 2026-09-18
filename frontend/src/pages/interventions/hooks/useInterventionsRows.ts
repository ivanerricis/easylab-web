import { listInterventions } from "@/lib/api";
import type { InterventionDto } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import type { InterventionSortOption, InterventionStatusFilter, InterventionTypeFilter } from "../components/types";

type UseInterventionsRowsParams = {
    /** Già rallentato dal chiamante (vedi `useUrlSearchText`): qui si cerca subito. */
    searchText: string;
    statusFilter: InterventionStatusFilter;
    typeFilter: InterventionTypeFilter;
    sortOption: InterventionSortOption;
    dateFrom?: string;
    dateTo?: string;
    currentPage: number;
    pageSize: number;
};

export const useInterventionsRows = ({
    searchText,
    statusFilter,
    typeFilter,
    sortOption,
    dateFrom,
    dateTo,
    currentPage,
    pageSize,
}: UseInterventionsRowsParams) => {
    const [sortBy, sortOrder] = sortOption.split(":") as [
        "createdAt" | "interventionDate" | "customer" | "status",
        "asc" | "desc",
    ];
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, reload } =
        usePaginatedRows<InterventionDto>({
            fetchRows: (signal) =>
                listInterventions({
                    page: currentPage,
                    pageSize,
                    search: searchText,
                    status: statusFilter,
                    type: typeFilter,
                    sortBy,
                    sortOrder,
                    dateFrom,
                    dateTo,
                    signal,
                }),
            queryKey: [currentPage, pageSize, searchText, statusFilter, typeFilter, sortOption, dateFrom, dateTo],
            errorMessage: "Impossibile caricare gli interventi",
            initialLoading: false,
        });

    return {
        interventionRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadInterventions: reload,
    };
};
