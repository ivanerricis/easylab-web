import CreateEntityButton from "@/components/create-entity-button";
import CreateInterventionDialog, {
    type CreateInterventionSubmitValues,
} from "@/components/dialogs/create/createInterventionDialog";
import EditInterventionDialog, {
    type EditInterventionSubmitValues,
} from "@/components/dialogs/edit/editInterventionDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import CustomDialog from "@/components/dialogs/customDialog";
import PageHeader from "@/components/page-header";
import ColumnVisibilityMenu from "@/components/column-visibility-menu";
import { useHiddenColumns } from "@/hooks/useHiddenColumns";
import { formatSortOption, parseSortOption, type TableSort } from "@/lib/tableSort";
import TablePagination from "@/components/table-pagination";
import {
    createIntervention,
    deleteIntervention,
    getApiErrorMessage,
    getInterventionPrintUrl,
    sendInterventionEmail,
    updateIntervention,
} from "@/lib/api";
import { useState } from "react";
import type { InterventionDto } from "@/types/dtos";
import { resolveCustomerId } from "@/lib/customerLookup";
import { toInterventionCreatePayload, toInterventionUpdatePayload } from "@/lib/interventionForm";
import { toast } from "sonner";
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
import { openPrintWindow } from "@/lib/utils";
import { entityPaths } from "@/lib/entityPaths";
import { showCreatedToast } from "@/lib/createdToast";
import { Mail } from "lucide-react";

const statusFilters: InterventionStatusFilter[] = ["all", "programmato", "in_lavorazione", "completato"];
const typeFilters: InterventionTypeFilter[] = ["all", "consegna_materiale", "intervento_sede", "intervento_remoto"];
const sortOptionValues = interventionSortOptions.map((option) => option.value);

const InterventionsPage = () => {
    const navigate = useNavigate();
    const { searchParams, updateParams, currentPage, setCurrentPage, resetPage } = useListUrlState();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    usePageShortcut("n", () => setIsCreateDialogOpen(true));
    // Un solo stato per dialogo + bersaglio, invece di un booleano più uno o due stati
    // separati che ogni `onOpenChange` doveva azzerare insieme.
    const [interventionToEdit, setInterventionToEdit] = useState<InterventionDto | null>(null);
    const [interventionToDelete, setInterventionToDelete] = useState<InterventionDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [interventionIdToEmail, setInterventionIdToEmail] = useState<number | null>(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    // Filtri, ordinamento, ricerca e pagina stanno nell'indirizzo: vedi `useListUrlState`.
    // "status" è il nome che usa già la dashboard nei suoi collegamenti.
    const statusFilter = readEnumParam(searchParams, "status", statusFilters, "all");
    const typeFilter = readEnumParam(searchParams, "type", typeFilters, "all");
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
    const { hiddenColumnKeys, setColumnVisible, showAllColumns } = useHiddenColumns("interventions");
    const { interventionRows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, loadInterventions } =
        useInterventionsRows({
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
    const handleCreateIntervention = async (values: CreateInterventionSubmitValues) => {
        const customerId = await resolveCustomerId(values.customerId, values.customer);
        const createdIntervention = await createIntervention(toInterventionCreatePayload(values, customerId));

        await loadInterventions();

        showCreatedToast({
            message: `Intervento #${createdIntervention.id} creato`,
            onOpen: () => handleOpenIntervention(createdIntervention.id),
            onPrint: () => handlePrintIntervention(createdIntervention.id),
        });
    };

    const handleOpenDeleteDialog = (intervention: InterventionDto) => {
        setInterventionToDelete(intervention);
    };

    const handleOpenIntervention = (id: number) => {
        navigate(entityPaths.intervention(id));
    };

    const handleStatusFilterChange = (value: InterventionStatusFilter) => {
        updateParams({ status: value === "all" ? null : value });
    };

    const handleOpenEditDialog = (id: number) => {
        const intervention = interventionRows.find((row) => row.id === id);
        setInterventionToEdit(intervention ?? null);
    };

    const handleEditIntervention = async (values: EditInterventionSubmitValues) => {
        await updateIntervention(values.interventionId, toInterventionUpdatePayload(values));
        // Niente ritocco della riga in pagina prima di ricaricare: la lista si ricarica subito
        // comunque (la riga può anche uscire dal filtro), e il ritocco copiava sul client regole
        // del server, mostrando per un istante una riga a metà.
        await loadInterventions();
    };

    const handleDeleteIntervention = async () => {
        if (!interventionToDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteIntervention(interventionToDelete.id);
            toast.success("Intervento eliminato con successo");
            setInterventionToDelete(null);
            await loadInterventions();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile eliminare l'intervento"));
        } finally {
            setIsDeleting(false);
        }
    };

    const handlePrintIntervention = (id: number) => {
        openPrintWindow(getInterventionPrintUrl(id));
    };

    const handleOpenSendEmailDialog = (id: number) => {
        setInterventionIdToEmail(id);
    };

    const handleConfirmSendEmailIntervention = async () => {
        if (interventionIdToEmail == null || isSendingEmail) {
            return;
        }

        try {
            setIsSendingEmail(true);
            const result = await sendInterventionEmail(interventionIdToEmail);
            toast.success(result.message);
            setInterventionIdToEmail(null);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile inviare l'email"));
        } finally {
            setIsSendingEmail(false);
        }
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <>
                <PageHeader
                    title="Interventi"
                    description="Gestisci consegne materiale e interventi in sede o da remoto."
                    action={
                        <CreateEntityButton label="Crea nuovo intervento" onClick={() => setIsCreateDialogOpen(true)} />
                    }
                />

                <CreateInterventionDialog
                    open={isCreateDialogOpen}
                    onOpenChange={setIsCreateDialogOpen}
                    onSubmit={handleCreateIntervention}
                />

                <EditInterventionDialog
                    open={interventionToEdit != null}
                    interventionId={interventionToEdit?.id ?? null}
                    customerName={interventionToEdit?.customer ?? ""}
                    onOpenChange={(open) => {
                        if (!open) {
                            setInterventionToEdit(null);
                        }
                    }}
                    onSubmit={handleEditIntervention}
                />

                <ConfirmDeleteDialog
                    open={interventionToDelete != null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setInterventionToDelete(null);
                        }
                    }}
                    title="Elimina intervento"
                    description={
                        interventionToDelete
                            ? `Sei sicuro di voler eliminare l'intervento ID ${interventionToDelete.id}?`
                            : "Sei sicuro di voler eliminare questo intervento?"
                    }
                    isDeleting={isDeleting}
                    onConfirm={handleDeleteIntervention}
                />

                <CustomDialog
                    open={interventionIdToEmail != null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setInterventionIdToEmail(null);
                        }
                    }}
                    title="Invia email intervento"
                    description={`Sei sicuro di voler inviare l'email per l'intervento ID ${interventionIdToEmail}?`}
                    confirmLabel="Invia"
                    // La busta come il pulsante della riga che apre questo dialogo.
                    confirmIcon={Mail}
                    cancelLabel="Annulla"
                    confirmDisabled={isSendingEmail}
                    onCancel={() => setInterventionIdToEmail(null)}
                    onConfirm={handleConfirmSendEmailIntervention}
                />

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
                            columns={interventionColumns}
                            hiddenColumnKeys={hiddenColumnKeys}
                            onColumnVisibleChange={setColumnVisible}
                            onShowAll={showAllColumns}
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
                            columns={interventionColumns}
                            sort={parseSortOption(sortOption)}
                            onSortChange={handleTableSortChange}
                            hiddenColumnKeys={hiddenColumnKeys}
                            rows={interventionRows}
                            searchText={committedSearchText}
                            hasActiveFilters={
                                statusFilter !== "all" || typeFilter !== "all" || dateFrom != null || dateTo != null
                            }
                            onOpenIntervention={handleOpenIntervention}
                            onEditIntervention={handleOpenEditDialog}
                            onPrintIntervention={handlePrintIntervention}
                            onSendEmailIntervention={handleOpenSendEmailDialog}
                            onDeleteIntervention={handleOpenDeleteDialog}
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
