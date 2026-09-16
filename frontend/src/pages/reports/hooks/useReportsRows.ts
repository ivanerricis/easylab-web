import { listReports } from "@/lib/api";
import type { ReportDto } from "@/types/dtos";
import { useCallback } from "react";
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
};

export const useReportsRows = ({
    searchText,
    visibilityFilter,
    sortOption,
    dateFrom,
    dateTo,
    currentPage,
    pageSize,
}: UseReportsRowsParams) => {
    const [sortBy, sortOrder] = sortOption.split(":") as ["createdAt" | "customer" | "totalPrice", "asc" | "desc"];
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, reload, updateRow } =
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
        });

    const updateReportRow = useCallback(
        (reportId: number, updater: (report: ReportDto) => ReportDto) => {
            updateRow((report) => report.id === reportId, updater);
        },
        [updateRow]
    );

    return {
        reportRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadReports: reload,
        updateReportRow,
    };
};
