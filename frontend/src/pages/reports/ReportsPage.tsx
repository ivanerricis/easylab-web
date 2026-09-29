import CreateEntityButton from "@/components/create-entity-button";
import type { EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import PageHeader from "@/components/page-header";
import ColumnVisibilityMenu from "@/components/column-visibility-menu";
import { useHiddenColumns } from "@/hooks/useHiddenColumns";
import { formatSortOption, parseSortOption, type TableSort } from "@/lib/tableSort";
import TablePagination from "@/components/table-pagination";
import { deleteReport, getReportPrintUrl, updateReport } from "@/lib/api";
import { Suspense, useState } from "react";
import type { ReportDto } from "@/types/dtos";
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
import { usePendingAction } from "@/hooks/usePendingAction";
import { lazyWithPrefetch, useHasBeenOpen, usePrefetchWhenIdle } from "@/lib/lazyDialog";
import { openPrintWindow } from "@/lib/utils";
import { entityPaths } from "@/lib/entityPaths";
import { toReportUpdatePayload } from "@/lib/reportForm";
import { useCreateReportFlow } from "@/hooks/useCreateEntityFlow";

/**
 * I dialoghi di creazione e modifica si scaricano solo quando servono, non con la pagina (vedi
 * `lazyWithPrefetch`): quello di creazione già al passaggio del mouse o al focus su "Crea
 * nuovo…", entrambi a pagina ferma.
 */
const { Component: CreateReportDialog, prefetch: prefetchCreateReportDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/create/createReportDialog")
);
const { Component: EditReportDialog, prefetch: prefetchEditReportDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/edit/editReportDialog")
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
    // Un solo stato per dialogo + bersaglio, invece di un booleano più uno o due stati
    // separati che ogni `onOpenChange` doveva azzerare insieme: `open={reportToEdit != null}`
    // basta da solo a dire se il dialogo è aperto.
    const [reportToEdit, setReportToEdit] = useState<ReportDto | null>(null);
    const hasOpenedCreateDialog = useHasBeenOpen(isCreateDialogOpen);
    const hasOpenedEditDialog = useHasBeenOpen(reportToEdit != null);
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
    const deleteAction = usePendingAction({
        run: (report: ReportDto) => deleteReport(report.id),
        successMessage: "Report eliminato con successo",
        errorMessage: "Impossibile eliminare il report",
        onDone: () => loadReports(),
    });

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

    const handleOpenEditDialog = (id: number) => {
        const report = reportRows.find((row) => row.id === id);
        setReportToEdit(report ?? null);
    };

    const handleEditReport = async (values: EditReportSubmitValues) => {
        await updateReport(values.reportId, toReportUpdatePayload(values));
        // Niente ritocco della riga in pagina prima di ricaricare: la lista si ricarica subito
        // comunque (la riga può anche uscire dal filtro), e il ritocco copiava sul client regole
        // del server (il totale come prezzo interno più compenso del tecnico), mostrando per un istante una riga a metà.
        await loadReports();
    };

    const handlePrintReport = (id: number) => {
        openPrintWindow(getReportPrintUrl(id));
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

                {hasOpenedEditDialog ? (
                    <Suspense fallback={null}>
                        <EditReportDialog
                            open={reportToEdit != null}
                            reportId={reportToEdit?.id ?? null}
                            customerName={reportToEdit?.customer ?? ""}
                            onOpenChange={(open) => {
                                if (!open) {
                                    setReportToEdit(null);
                                }
                            }}
                            onSubmit={handleEditReport}
                        />
                    </Suspense>
                ) : null}

                <ConfirmDeleteDialog
                    open={deleteAction.isOpen}
                    onOpenChange={deleteAction.onOpenChange}
                    title="Elimina report"
                    description={
                        deleteAction.pending
                            ? `Sei sicuro di voler eliminare il report ID ${deleteAction.pending.id}?`
                            : "Sei sicuro di voler eliminare questo report?"
                    }
                    isDeleting={deleteAction.isRunning}
                    onConfirm={deleteAction.confirm}
                />

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
                            columns={reportColumns}
                            hiddenColumnKeys={hiddenColumnKeys}
                            onColumnVisibleChange={setColumnVisible}
                            onShowAll={showAllColumns}
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
                            columns={reportColumns}
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
                            onEditReport={handleOpenEditDialog}
                            onPrintReport={handlePrintReport}
                            onDeleteReport={deleteAction.open}
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
