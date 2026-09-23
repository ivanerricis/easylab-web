import { listReports } from "@/lib/api";
import type { ReportDto } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import type { ReportSortOption, ReportVisibilityFilter } from "../components/types";

type UseReportsRowsParams = {
    /** Già rallentato dal chiamante (vedi `useUrlSearchText`): qui si cerca subito. */
    searchText: string;
    visibilityFilter: ReportVisibilityFilter;
    sortOption: ReportSortOption;
    dateFrom?: string;
    dateTo?: string;
    currentPage: number;
    pageSize: number;
    /** Chiamato con l'ultima pagina valida quando `currentPage` la supera. Vedi `usePaginatedRows`. */
    onPageOutOfRange?: (lastPage: number) => void;
};

export const useReportsRows = ({
    searchText,
    visibilityFilter,
    sortOption,
    dateFrom,
    dateTo,
    currentPage,
    pageSize,
    onPageOutOfRange,
}: UseReportsRowsParams) => {
    const [sortBy, sortOrder] = sortOption.split(":") as ["createdAt" | "customer", "asc" | "desc"];
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, reload } =
        usePaginatedRows<ReportDto>({
            fetchRows: (signal) =>
                listReports({
                    page: currentPage,
                    pageSize,
                    search: searchText,
                    visibility: visibilityFilter,
                    sortBy,
                    sortOrder,
                    dateFrom,
                    dateTo,
                    signal,
                }),
            queryKey: [currentPage, pageSize, searchText, visibilityFilter, sortOption, dateFrom, dateTo],
            errorMessage: "Impossibile caricare i report",
            initialLoading: false,
            page: currentPage,
            onPageOutOfRange,
        });

    return {
        reportRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadReports: reload,
    };
};
