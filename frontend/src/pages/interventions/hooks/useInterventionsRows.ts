import { listInterventions } from "@/lib/api";
import type { InterventionDto } from "@/types/dtos";
import { useCallback } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import type { InterventionSortOption, InterventionStatusFilter, InterventionTypeFilter } from "../components/types";

type UseInterventionsRowsParams = {
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
    const debouncedSearchText = useDebouncedValue(searchText);
    const [sortBy, sortOrder] = sortOption.split(":") as [
        "createdAt" | "interventionDate" | "customer",
        "asc" | "desc",
    ];
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, reload, updateRow } =
        usePaginatedRows<InterventionDto>({
            fetchRows: (signal) =>
                listInterventions({
                    page: currentPage,
                    pageSize,
                    search: debouncedSearchText,
                    status: statusFilter,
                    type: typeFilter,
                    sortBy,
                    sortOrder,
                    dateFrom,
                    dateTo,
                    signal,
                }),
            queryKey: [
                currentPage,
                pageSize,
                debouncedSearchText,
                statusFilter,
                typeFilter,
                sortOption,
                dateFrom,
                dateTo,
            ],
            errorMessage: "Impossibile caricare gli interventi",
            initialLoading: false,
        });

    const updateInterventionRow = useCallback(
        (interventionId: number, updater: (intervention: InterventionDto) => InterventionDto) => {
            updateRow((intervention) => intervention.id === interventionId, updater);
        },
        [updateRow]
    );

    return {
        interventionRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadInterventions: reload,
        updateInterventionRow,
    };
};
