import { contractPrintName, contractStatusColor } from "@/lib/contracts";
import ColumnVisibilityMenu from "@/components/column-visibility-menu";
import CreateEntityButton from "@/components/create-entity-button";
import CreateContractDialog, { type ContractSubmitValues } from "@/components/dialogs/create/createContractDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import EntityTable from "@/components/entity-table";
import PageHeader from "@/components/page-header";
import TableActionButton from "@/components/table-action-button";
import TablePagination from "@/components/table-pagination";
import { useHiddenColumns } from "@/hooks/useHiddenColumns";
import { listUrlParams, readEnumParam, useListUrlState, useUrlSearchText } from "@/hooks/useListUrlState";
import { usePageShortcut } from "@/hooks/usePageShortcut";
import { usePendingAction } from "@/hooks/usePendingAction";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { createContract, deleteContract, getContractPrintUrl, updateContract } from "@/lib/api";
import { toContractCreatePayload, toContractUpdatePayload } from "@/lib/contractForm";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
import { entityPaths } from "@/lib/entityPaths";
import { formatSortOption, parseSortOption, type TableSort } from "@/lib/tableSort";
import type { ContractDto } from "@/types/dtos";
import { openPrintWindow } from "@/lib/utils";
import { Pencil, Printer, Trash2 } from "lucide-react";
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
    // Un solo stato per dialogo + bersaglio: `open={contractToEdit != null}` basta da solo.
    const [contractToEdit, setContractToEdit] = useState<ContractDto | null>(null);
    const [pageSize, setStoredPageSize] = useTableRowsPerPage("contracts");
    const { hiddenColumnKeys, setColumnVisible, showAllColumns } = useHiddenColumns("contracts", contractColumns);
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
    const deleteAction = usePendingAction({
        run: (contract: ContractDto) => deleteContract(contract.id),
        successMessage: "Contratto eliminato con successo",
        errorMessage: "Impossibile eliminare il contratto",
        onDone: () => loadContracts(),
    });

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

    const handleEditContract = async (values: ContractSubmitValues) => {
        if (!contractToEdit) {
            return;
        }

        await updateContract(contractToEdit.id, toContractUpdatePayload(values));
        await loadContracts();
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <PageHeader
                title="Contratti"
                description="Gestisci i contratti di assistenza e noleggio dei clienti."
                action={<CreateEntityButton label="Crea nuovo contratto" onClick={() => setIsCreateDialogOpen(true)} />}
            />

            {isCreateDialogOpen ? (
                <CreateContractDialog
                    open={isCreateDialogOpen}
                    onOpenChange={setIsCreateDialogOpen}
                    onSubmit={handleCreateContract}
                />
            ) : null}

            {contractToEdit ? (
                <CreateContractDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) {
                            setContractToEdit(null);
                        }
                    }}
                    mode="edit"
                    initialValues={contractToEdit}
                    onSubmit={handleEditContract}
                />
            ) : null}

            <ConfirmDeleteDialog
                open={deleteAction.isOpen}
                onOpenChange={deleteAction.onOpenChange}
                title="Elimina contratto"
                description={
                    deleteAction.pending
                        ? `Sei sicuro di voler eliminare il contratto ID ${deleteAction.pending.id} di ${deleteAction.pending.customerName}?`
                        : "Sei sicuro di voler eliminare questo contratto?"
                }
                isDeleting={deleteAction.isRunning}
                onConfirm={deleteAction.confirm}
            />

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
                        columns={contractColumns}
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
                        columns={contractColumns}
                        rows={contractRows}
                        getRowKey={(row) => row.id}
                        getRowStatusColor={(row) => contractStatusColor(row.effectiveStatus)}
                        emptyMessage={resolveEmptyListMessage({
                            emptyMessage: "Nessun contratto disponibile.",
                            searchText: committedSearchText,
                            hasActiveFilters: typeFilter !== "all" || statusFilter !== "all",
                            filteredMessage: "Nessun contratto corrisponde ai filtri.",
                        })}
                        renderRowActions={(row) => (
                            <>
                                <TableActionButton
                                    variant="default"
                                    size="icon-lg"
                                    className="bg-muted hover:bg-primary/20"
                                    onClick={() => setContractToEdit(row)}
                                    aria-label={`Modifica contratto ${row.id}`}
                                >
                                    <Pencil className="size-5 text-muted-foreground transition-colors group-hover/button:text-primary" />
                                </TableActionButton>
                                <TableActionButton
                                    variant="default"
                                    size="icon-lg"
                                    className="bg-muted hover:bg-action-print/20"
                                    onClick={() => openPrintWindow(getContractPrintUrl(row.id))}
                                    aria-label={`Stampa ${contractPrintName(row.effectiveStatus)} ${row.id}`}
                                >
                                    <Printer className="size-5 text-muted-foreground transition-colors group-hover/button:text-action-print" />
                                </TableActionButton>
                                <TableActionButton
                                    variant="destructive"
                                    size="icon-lg"
                                    onClick={() => deleteAction.open(row)}
                                    aria-label={`Elimina contratto ${row.id}`}
                                >
                                    <Trash2 className="size-5" />
                                </TableActionButton>
                            </>
                        )}
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
