import { contractStatusColor } from "@/lib/contracts";
import ColumnVisibilityMenu from "@/components/column-visibility-menu";
import CreateEntityButton from "@/components/create-entity-button";
import CreateContractDialog, { type ContractSubmitValues } from "@/components/dialogs/create/createContractDialog";
import EntityTable from "@/components/entity-table";
import PageHeader from "@/components/page-header";
import TablePagination from "@/components/table-pagination";
import { useColumnOrder } from "@/hooks/useColumnOrder";
import { useHiddenColumns } from "@/hooks/useHiddenColumns";
import { listUrlParams, readEnumParam, useListUrlState, useUrlSearchText } from "@/hooks/useListUrlState";
import { usePageShortcut } from "@/hooks/usePageShortcut";
import { useContractRowActions } from "@/hooks/useContractRowActions";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { createContract } from "@/lib/api";
import { toContractCreatePayload } from "@/lib/contractForm";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
import { entityPaths } from "@/lib/entityPaths";
import { formatSortOption, parseSortOption, type TableSort } from "@/lib/tableSort";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { contractColumns } from "./components/contract-columns";
import ContractsFilters from "./components/contracts-filters";
import {
    contractSortOptions,
    DEFAULT_CONTRACT_SORT_OPTION,
    type ContractSortOption,
    type ContractStatusFilter,
    type ContractTypeFilter,
} from "./components/types";
import { useContractsRows } from "./hooks/useContractsRows";

const typeFilters: ContractTypeFilter[] = ["all", "assistance", "rental"];
const statusFilters: ContractStatusFilter[] = ["all", "draft", "active", "cancelled", "expired"];
const sortOptionValues = contractSortOptions.map((option) => option.value);

const ContractsPage = () => {
    const navigate = useNavigate();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    usePageShortcut("n", () => setIsCreateDialogOpen(true));
    // Filtri, ordinamento, ricerca e pagina stanno nell'indirizzo: vedi `useListUrlState`.
    const { searchParams, updateParams, currentPage, setCurrentPage, resetPage } = useListUrlState();
    const typeFilter = readEnumParam(searchParams, "type", typeFilters, "all");
    const statusFilter = readEnumParam(searchParams, "status", statusFilters, "all");
    const sortOption = readEnumParam(searchParams, listUrlParams.sort, sortOptionValues, DEFAULT_CONTRACT_SORT_OPTION);
    const committedSearchText = searchParams.get(listUrlParams.search) ?? "";
    const [searchText, setSearchText] = useUrlSearchText(committedSearchText, (value) =>
        updateParams({ [listUrlParams.search]: value })
    );
    const [pageSize, setStoredPageSize] = useTableRowsPerPage("contracts");
    const { hiddenColumnKeys, setColumnVisible, showAllColumns } = useHiddenColumns("contracts", contractColumns);
    // L'ordine delle colonne vale per tabella e menu insieme: entrambi ricevono `orderedColumns`.
    const { orderedColumns, moveColumn, moveColumnBy, resetColumnOrder, isCustomOrder } = useColumnOrder(
        "contracts",
        contractColumns
    );
    const {
        contractRows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadError,
        loadContracts,
    } = useContractsRows({
        searchText: committedSearchText,
        typeFilter,
        statusFilter,
        sortOption,
        currentPage,
        pageSize,
        onPageOutOfRange: setCurrentPage,
    });
    // Modifica, stampa ed eliminazione sono le stesse delle schede di cliente e fornitore.
    const { getRowActions, dialogs: rowActionDialogs } = useContractRowActions({ onChanged: loadContracts });

    const handleSortOptionChange = (value: ContractSortOption) =>
        updateParams({ [listUrlParams.sort]: value === DEFAULT_CONTRACT_SORT_OPTION ? null : value });

    // Dalle intestazioni arrivano solo le coppie campo/verso che le colonne dichiarano, e sono
    // tutte fra le opzioni del menu: il cast non allarga niente.
    const handleTableSortChange = (nextSort: TableSort) =>
        handleSortOptionChange(formatSortOption(nextSort) as ContractSortOption);

    const setPageSize = (nextPageSize: typeof pageSize) => {
        setStoredPageSize(nextPageSize);
        resetPage();
    };

    const handleCreateContract = async (values: ContractSubmitValues) => {
        await createContract(toContractCreatePayload(values));
        await loadContracts();
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <PageHeader
                title="Contratti"
                description="Gestisci i contratti di assistenza e noleggio dei clienti."
                action={
                    <CreateEntityButton
                        label="Crea nuovo contratto"
                        shortcut="n"
                        onClick={() => setIsCreateDialogOpen(true)}
                    />
                }
            />

            {isCreateDialogOpen ? (
                <CreateContractDialog
                    open={isCreateDialogOpen}
                    onOpenChange={setIsCreateDialogOpen}
                    onSubmit={handleCreateContract}
                />
            ) : null}

            {rowActionDialogs}

            <ContractsFilters
                searchText={searchText}
                onSearchTextChange={setSearchText}
                typeFilter={typeFilter}
                onTypeFilterChange={(value) => updateParams({ type: value === "all" ? null : value })}
                statusFilter={statusFilter}
                onStatusFilterChange={(value) => updateParams({ status: value === "all" ? null : value })}
                sortOption={sortOption}
                onSortOptionChange={handleSortOptionChange}
                columnsMenu={
                    <ColumnVisibilityMenu
                        columns={orderedColumns}
                        onColumnMoveBy={moveColumnBy}
                        onResetOrder={resetColumnOrder}
                        isCustomOrder={isCustomOrder}
                        hiddenColumnKeys={hiddenColumnKeys}
                        onColumnVisibleChange={setColumnVisible}
                        onShowAll={showAllColumns}
                    />
                }
                onRefresh={loadContracts}
                isRefreshing={isLoading}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <EntityTable
                        tableKey="contracts"
                        columns={orderedColumns}
                        onColumnMove={moveColumn}
                        rows={contractRows}
                        getRowKey={(row) => row.id}
                        getRowStatusColor={(row) => contractStatusColor(row.effectiveStatus)}
                        emptyMessage={resolveEmptyListMessage({
                            emptyMessage: "Nessun contratto disponibile.",
                            searchText: committedSearchText,
                            hasActiveFilters: typeFilter !== "all" || statusFilter !== "all",
                            filteredMessage: "Nessun contratto corrisponde ai filtri.",
                        })}
                        getRowActions={getRowActions}
                        onRowOpen={(row) => void navigate(entityPaths.contract(row.id))}
                        isInitialLoading={isInitialLoading}
                        isRefetching={isRefetching}
                        loadError={loadError}
                        onRetry={() => void loadContracts()}
                        skeletonRowCount={pageSize}
                        sort={parseSortOption(sortOption)}
                        onSortChange={handleTableSortChange}
                        hiddenColumnKeys={hiddenColumnKeys}
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
        </div>
    );
};

export default ContractsPage;
