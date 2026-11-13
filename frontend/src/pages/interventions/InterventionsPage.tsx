import CreateEntityButton from "@/components/create-entity-button";
import PageHeader from "@/components/page-header";
import ColumnVisibilityMenu from "@/components/column-visibility-menu";
import { useColumnOrder } from "@/hooks/useColumnOrder";
import { useHiddenColumns } from "@/hooks/useHiddenColumns";
import { formatSortOption, parseSortOption, type TableSort } from "@/lib/tableSort";
import TablePagination from "@/components/table-pagination";
import { Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { interventionColumns } from "./components/intervention-columns";
import InterventionsFilters from "./components/interventions-filters";
import InterventionsTable from "./components/interventions-table";
import {
    DEFAULT_INTERVENTION_SORT_OPTION,
    interventionSortOptions,
    type InterventionSortOption,
    type InterventionStatusFilter,
    type InterventionTypeFilter,
} from "./components/types";
import { fromLegacyInterventionValue } from "@/lib/interventions";
import { useInterventionsRows } from "./hooks/useInterventionsRows";
import {
    listUrlParams,
    readDateParam,
    readEnumParam,
    useListUrlState,
    useUrlSearchText,
} from "@/hooks/useListUrlState";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { usePageShortcut } from "@/hooks/usePageShortcut";
import { prefetchEditInterventionDialog, useInterventionRowActions } from "@/hooks/useInterventionRowActions";
import { lazyWithPrefetch, useHasBeenOpen, usePrefetchWhenIdle } from "@/lib/lazyDialog";
import { entityPaths } from "@/lib/entityPaths";
import { useCreateInterventionFlow } from "@/hooks/useCreateEntityFlow";

const statusFilters: InterventionStatusFilter[] = ["all", "scheduled", "in_progress", "completed"];
/**
 * I dialoghi di creazione e modifica si scaricano solo quando servono, non con la pagina (vedi
 * `lazyWithPrefetch`): quello di creazione già al passaggio del mouse o al focus su "Crea
 * nuovo…", entrambi a pagina ferma.
 */
const { Component: CreateInterventionDialog, prefetch: prefetchCreateInterventionDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/create/createInterventionDialog")
);
const prefetchInterventionDialogs = () => {
    prefetchCreateInterventionDialog();
    prefetchEditInterventionDialog();
};

const typeFilters: InterventionTypeFilter[] = ["all", "material_delivery", "customer_site", "remote", "lab"];
const sortOptionValues = interventionSortOptions.map((option) => option.value);

const InterventionsPage = () => {
    const navigate = useNavigate();
    const { searchParams, updateParams, currentPage, setCurrentPage, resetPage } = useListUrlState();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    usePageShortcut("n", () => setIsCreateDialogOpen(true));
    const hasOpenedCreateDialog = useHasBeenOpen(isCreateDialogOpen);
    // Filtri, ordinamento, ricerca e pagina stanno nell'indirizzo: vedi `useListUrlState`.
    // "status" è il nome che usa già la dashboard nei suoi collegamenti.
    const statusFilter = readEnumParam(searchParams, "status", statusFilters, "all", fromLegacyInterventionValue);
    const typeFilter = readEnumParam(searchParams, "type", typeFilters, "all", fromLegacyInterventionValue);
    const sortOption = readEnumParam(
        searchParams,
        listUrlParams.sort,
        sortOptionValues,
        DEFAULT_INTERVENTION_SORT_OPTION
    );
    const dateFrom = readDateParam(searchParams, listUrlParams.dateFrom);
    const dateTo = readDateParam(searchParams, listUrlParams.dateTo);
    const committedSearchText = searchParams.get(listUrlParams.search) ?? "";
    const [searchText, setSearchText] = useUrlSearchText(committedSearchText, (value) =>
        updateParams({ [listUrlParams.search]: value })
    );
    const [pageSize, setStoredPageSize] = useTableRowsPerPage("interventions");
    const { hiddenColumnKeys, setColumnVisible, showAllColumns } = useHiddenColumns(
        "interventions",
        interventionColumns
    );
    // L'ordine delle colonne vale per tabella e menu insieme: entrambi ricevono `orderedColumns`.
    const { orderedColumns, moveColumn, moveColumnBy, resetColumnOrder, isCustomOrder } = useColumnOrder(
        "interventions",
        interventionColumns
    );
    const {
        interventionRows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadError,
        loadInterventions,
    } = useInterventionsRows({
        searchText: committedSearchText,
        statusFilter,
        typeFilter,
        sortOption,
        dateFrom,
        dateTo,
        currentPage,
        pageSize,
        onPageOutOfRange: setCurrentPage,
    });

    const { renderRowActions, dialogs: rowActionDialogs } = useInterventionRowActions({
        onChanged: loadInterventions,
    });

    usePrefetchWhenIdle(prefetchInterventionDialogs);

    const handleSortOptionChange = (value: InterventionSortOption) =>
        updateParams({ [listUrlParams.sort]: value === DEFAULT_INTERVENTION_SORT_OPTION ? null : value });

    // Dalle intestazioni arrivano solo le coppie campo/verso che le colonne dichiarano, e sono
    // tutte fra le opzioni del menu: il cast non allarga niente.
    const handleTableSortChange = (nextSort: TableSort) =>
        handleSortOptionChange(formatSortOption(nextSort) as InterventionSortOption);

    const setPageSize = (nextPageSize: typeof pageSize) => {
        setStoredPageSize(nextPageSize);
        resetPage();
    };

    // Niente try/catch: l'errore lo mostra il dialogo, che resta aperto. Qui c'era un
    // `toast.error` seguito da `throw`, e ogni errore compariva due volte.
    const handleCreateIntervention = useCreateInterventionFlow(loadInterventions);

    const handleOpenIntervention = (id: number) => {
        navigate(entityPaths.intervention(id));
    };

    const handleStatusFilterChange = (value: InterventionStatusFilter) => {
        updateParams({ status: value === "all" ? null : value });
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <>
                <PageHeader
                    title="Interventi"
                    description="Gestisci consegne materiale e interventi in sede o da remoto."
                    action={
                        <CreateEntityButton
                            label="Crea nuovo intervento"
                            onClick={() => setIsCreateDialogOpen(true)}
                            onPointerEnter={prefetchCreateInterventionDialog}
                            onFocus={prefetchCreateInterventionDialog}
                        />
                    }
                />

                {hasOpenedCreateDialog ? (
                    <Suspense fallback={null}>
                        <CreateInterventionDialog
                            open={isCreateDialogOpen}
                            onOpenChange={setIsCreateDialogOpen}
                            onSubmit={handleCreateIntervention}
                        />
                    </Suspense>
                ) : null}

                {rowActionDialogs}

                <InterventionsFilters
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    statusFilter={statusFilter}
                    onStatusFilterChange={handleStatusFilterChange}
                    typeFilter={typeFilter}
                    onTypeFilterChange={(value: InterventionTypeFilter) =>
                        updateParams({ type: value === "all" ? null : value })
                    }
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
                    onRefresh={loadInterventions}
                    isRefreshing={isLoading}
                />

                <div className="flex min-h-0 flex-1 flex-col gap-4">
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <InterventionsTable
                            isInitialLoading={isInitialLoading}
                            isRefetching={isRefetching}
                            skeletonRowCount={pageSize}
                            columns={orderedColumns}
                            onColumnMove={moveColumn}
                            sort={parseSortOption(sortOption)}
                            onSortChange={handleTableSortChange}
                            hiddenColumnKeys={hiddenColumnKeys}
                            rows={interventionRows}
                            loadError={loadError}
                            onRetry={() => void loadInterventions()}
                            searchText={committedSearchText}
                            hasActiveFilters={
                                statusFilter !== "all" || typeFilter !== "all" || dateFrom != null || dateTo != null
                            }
                            onOpenIntervention={handleOpenIntervention}
                            renderRowActions={renderRowActions}
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

export default InterventionsPage;
