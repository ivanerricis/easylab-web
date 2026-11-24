import CreateEntityButton from "@/components/create-entity-button";
import PageHeader from "@/components/page-header";
import ColumnVisibilityMenu from "@/components/column-visibility-menu";
import { useColumnOrder } from "@/hooks/useColumnOrder";
import { useHiddenColumns } from "@/hooks/useHiddenColumns";
import { formatSortOption, parseSortOption, type TableSort } from "@/lib/tableSort";
import TablePagination from "@/components/table-pagination";
import { Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { reportColumns } from "./components/report-columns";
import ReportsFilters from "./components/reports-filters";
import ReportsTable from "./components/reports-table";
import {
    DEFAULT_REPORT_SORT_OPTION,
    reportSortOptions,
    type ReportSortOption,
    type ReportVisibilityFilter,
} from "./components/types";
import { useReportsRows } from "./hooks/useReportsRows";
import {
    listUrlParams,
    readDateParam,
    readEnumParam,
    useListUrlState,
    useUrlSearchText,
} from "@/hooks/useListUrlState";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { usePageShortcut } from "@/hooks/usePageShortcut";
import { prefetchEditReportDialog, useReportRowActions } from "@/hooks/useReportRowActions";
import { lazyWithPrefetch, useHasBeenOpen, usePrefetchWhenIdle } from "@/lib/lazyDialog";
import { entityPaths } from "@/lib/entityPaths";
import { useCreateReportFlow } from "@/hooks/useCreateEntityFlow";

/**
 * I dialoghi di creazione e modifica si scaricano solo quando servono, non con la pagina (vedi
 * `lazyWithPrefetch`): quello di creazione già al passaggio del mouse o al focus su "Crea
 * nuovo…", entrambi a pagina ferma.
 */
const { Component: CreateReportDialog, prefetch: prefetchCreateReportDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/create/createReportDialog")
);
const prefetchReportDialogs = () => {
    prefetchCreateReportDialog();
    prefetchEditReportDialog();
};

const visibilityFilters: ReportVisibilityFilter[] = ["all", "open", "closed"];
const sortOptionValues = reportSortOptions.map((option) => option.value);

const ReportsPage = () => {
    const navigate = useNavigate();
    const { searchParams, updateParams, currentPage, setCurrentPage, resetPage } = useListUrlState();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    usePageShortcut("n", () => setIsCreateDialogOpen(true));
    const hasOpenedCreateDialog = useHasBeenOpen(isCreateDialogOpen);
    // Filtri, ordinamento, ricerca e pagina stanno nell'indirizzo: vedi `useListUrlState`.
    // "visibility" è il nome che usa già la dashboard nei suoi collegamenti.
    const visibilityFilter = readEnumParam(searchParams, "visibility", visibilityFilters, "open");
    const sortOption = readEnumParam(searchParams, listUrlParams.sort, sortOptionValues, DEFAULT_REPORT_SORT_OPTION);
    const dateFrom = readDateParam(searchParams, listUrlParams.dateFrom);
    const dateTo = readDateParam(searchParams, listUrlParams.dateTo);
    const committedSearchText = searchParams.get(listUrlParams.search) ?? "";
    const [searchText, setSearchText] = useUrlSearchText(committedSearchText, (value) =>
        updateParams({ [listUrlParams.search]: value })
    );
    const [pageSize, setStoredPageSize] = useTableRowsPerPage("reports");
    const { hiddenColumnKeys, setColumnVisible, showAllColumns } = useHiddenColumns("reports", reportColumns);
    // L'ordine delle colonne vale per tabella e menu insieme: entrambi ricevono `orderedColumns`.
    const { orderedColumns, moveColumn, moveColumnBy, resetColumnOrder, isCustomOrder } = useColumnOrder(
        "reports",
        reportColumns
    );
    const { reportRows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, loadError, loadReports } =
        useReportsRows({
            searchText: committedSearchText,
            visibilityFilter,
            sortOption,
            dateFrom,
            dateTo,
            currentPage,
            pageSize,
            onPageOutOfRange: setCurrentPage,
        });
    // Modifica, stampa ed eliminazione sono le stesse della scheda del cliente.
    const { getRowActions, dialogs: rowActionDialogs } = useReportRowActions({ onChanged: loadReports });

    usePrefetchWhenIdle(prefetchReportDialogs);

    const handleSortOptionChange = (value: ReportSortOption) =>
        updateParams({ [listUrlParams.sort]: value === DEFAULT_REPORT_SORT_OPTION ? null : value });

    // Dalle intestazioni arrivano solo le coppie campo/verso che le colonne dichiarano, e sono
    // tutte fra le opzioni del menu: il cast non allarga niente.
    const handleTableSortChange = (nextSort: TableSort) =>
        handleSortOptionChange(formatSortOption(nextSort) as ReportSortOption);

    const setPageSize = (nextPageSize: typeof pageSize) => {
        setStoredPageSize(nextPageSize);
        resetPage();
    };

    // Niente try/catch: l'errore lo mostra il dialogo, che resta aperto. Qui c'era un
    // `toast.error` seguito da `throw`, e ogni errore compariva due volte.
    const handleCreateReport = useCreateReportFlow(loadReports);

    const handleOpenReport = (id: number) => {
        navigate(entityPaths.report(id));
    };

    const handleVisibilityFilterChange = (value: ReportVisibilityFilter) => {
        updateParams({ visibility: value === "open" ? null : value });
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <>
                <PageHeader
                    title="Report"
                    description="Gestisci i report del laboratorio."
                    // L'esportazione CSV sta in Impostazioni → Esportazione: è un'operazione
                    // sull'archivio, non una delle azioni quotidiane di questa pagina.
                    action={
                        <CreateEntityButton
                            label="Crea nuovo report"
                            shortcut="n"
                            onClick={() => setIsCreateDialogOpen(true)}
                            onPointerEnter={prefetchCreateReportDialog}
                            onFocus={prefetchCreateReportDialog}
                        />
                    }
                />

                {hasOpenedCreateDialog ? (
                    <Suspense fallback={null}>
                        <CreateReportDialog
                            open={isCreateDialogOpen}
                            onOpenChange={setIsCreateDialogOpen}
                            onSubmit={handleCreateReport}
                        />
                    </Suspense>
                ) : null}

                {rowActionDialogs}

                <ReportsFilters
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    visibilityFilter={visibilityFilter}
                    onVisibilityFilterChange={handleVisibilityFilterChange}
                    sortOption={sortOption}
                    onSortOptionChange={handleSortOptionChange}
                    dateFrom={dateFrom}
                    onDateFromChange={(value) => updateParams({ [listUrlParams.dateFrom]: value })}
                    dateTo={dateTo}
                    onDateToChange={(value) => updateParams({ [listUrlParams.dateTo]: value })}
                    onClearDates={() => updateParams({ [listUrlParams.dateFrom]: null, [listUrlParams.dateTo]: null })}
                    columnsMenu={
                        <ColumnVisibilityMenu
                            columns={orderedColumns}
                            hiddenColumnKeys={hiddenColumnKeys}
                            onColumnVisibleChange={setColumnVisible}
                            onShowAll={showAllColumns}
                            onColumnMoveBy={moveColumnBy}
                            onResetOrder={resetColumnOrder}
                            isCustomOrder={isCustomOrder}
                        />
                    }
                    onRefresh={loadReports}
                    isRefreshing={isLoading}
                />

                <div className="flex min-h-0 flex-1 flex-col gap-4">
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <ReportsTable
                            isInitialLoading={isInitialLoading}
                            isRefetching={isRefetching}
                            skeletonRowCount={pageSize}
                            columns={orderedColumns}
                            onColumnMove={moveColumn}
                            sort={parseSortOption(sortOption)}
                            onSortChange={handleTableSortChange}
                            hiddenColumnKeys={hiddenColumnKeys}
                            searchText={committedSearchText}
                            // "Report aperti" è il filtro di partenza, ma resta un filtro: con
                            // nessun report aperto "Nessun report disponibile." sarebbe falso.
                            hasActiveFilters={visibilityFilter !== "all" || dateFrom != null || dateTo != null}
                            rows={reportRows}
                            loadError={loadError}
                            onRetry={() => void loadReports()}
                            onOpenReport={handleOpenReport}
                            getRowActions={getRowActions}
                        />
                    </div>
                    <TablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>
            </>
        </div>
    );
};

export default ReportsPage;
