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
import { useNavigate, useSearchParams } from "react-router-dom";
import { interventionColumns } from "./components/intervention-columns";
import InterventionsFilters from "./components/interventions-filters";
import InterventionsTable from "./components/interventions-table";
import {
    DEFAULT_INTERVENTION_SORT_OPTION,
    type InterventionSortOption,
    type InterventionStatusFilter,
    type InterventionTypeFilter,
} from "./components/types";
import { useInterventionsRows } from "./hooks/useInterventionsRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { openPrintWindow } from "@/lib/utils";
import { Send } from "lucide-react";

const parseStatusFilter = (value: string | null): InterventionStatusFilter => {
    if (value === "all" || value === "programmato" || value === "in_lavorazione" || value === "completato") {
        return value;
    }

    return "all";
};

const InterventionsPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [interventionIdToEdit, setInterventionIdToEdit] = useState<number | null>(null);
    const [interventionCustomerNameToEdit, setInterventionCustomerNameToEdit] = useState("");
    const [interventionToDelete, setInterventionToDelete] = useState<InterventionDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [interventionIdToEmail, setInterventionIdToEmail] = useState<number | null>(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [statusFilter, setStatusFilter] = useState<InterventionStatusFilter>(() =>
        parseStatusFilter(searchParams.get("status"))
    );
    const [previousSearchParams, setPreviousSearchParams] = useState(searchParams);

    if (previousSearchParams !== searchParams) {
        setPreviousSearchParams(searchParams);
        setStatusFilter(parseStatusFilter(searchParams.get("status")));
    }

    const [searchText, setSearchText] = useState("");
    const [typeFilter, setTypeFilter] = useState<InterventionTypeFilter>("all");
    const [sortOption, setSortOption] = useState<InterventionSortOption>(DEFAULT_INTERVENTION_SORT_OPTION);
    const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
    const [dateTo, setDateTo] = useState<string | undefined>(undefined);
    const [pageSize, setPageSize] = useTableRowsPerPage("interventions");
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [searchText, statusFilter, typeFilter, sortOption, dateFrom, dateTo, pageSize],
    });
    const {
        interventionRows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadInterventions,
        updateInterventionRow,
    } = useInterventionsRows({
        searchText,
        statusFilter,
        typeFilter,
        sortOption,
        dateFrom,
        dateTo,
        currentPage,
        pageSize,
    });

    // Niente try/catch: l'errore lo mostra il dialogo, che resta aperto. Qui c'era un
    // `toast.error` seguito da `throw`, e ogni errore compariva due volte.
    const handleCreateIntervention = async (values: CreateInterventionSubmitValues) => {
        const customerId = await resolveCustomerId(values.customerId, values.customer);
        const createdIntervention = await createIntervention(toInterventionCreatePayload(values, customerId));

        await loadInterventions();

        if (window.confirm("Intervento creato. Vuoi stamparlo adesso?")) {
            handlePrintIntervention(createdIntervention.id);
        }
    };

    const handleOpenDeleteDialog = (intervention: InterventionDto) => {
        setInterventionToDelete(intervention);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenIntervention = (id: number) => {
        navigate(`/interventions/${id}`);
    };

    const handleStatusFilterChange = (value: InterventionStatusFilter) => {
        setStatusFilter(value);
        setSearchParams(value === "all" ? {} : { status: value }, { replace: true });
    };

    const handleOpenEditDialog = (id: number) => {
        const intervention = interventionRows.find((row) => row.id === id);
        setInterventionIdToEdit(id);
        setInterventionCustomerNameToEdit(intervention?.customer ?? "");
        setIsEditDialogOpen(true);
    };

    const handleEditIntervention = async (values: EditInterventionSubmitValues) => {
        await updateIntervention(values.interventionId, toInterventionUpdatePayload(values));

        updateInterventionRow(values.interventionId, (intervention) => ({
            ...intervention,
            type: values.type,
            status: values.status,
            description: values.description,
            collaboratorId: values.collaboratorId,
            interventionDate: values.interventionDate,
            startTime: values.startTime,
            endTime: values.endTime,
        }));

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
            setIsDeleteDialogOpen(false);
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
                    open={isEditDialogOpen}
                    interventionId={interventionIdToEdit}
                    customerName={interventionCustomerNameToEdit}
                    onOpenChange={(open) => {
                        setIsEditDialogOpen(open);
                        if (!open) {
                            setInterventionIdToEdit(null);
                            setInterventionCustomerNameToEdit("");
                        }
                    }}
                    onSubmit={handleEditIntervention}
                />

                <ConfirmDeleteDialog
                    open={isDeleteDialogOpen}
                    onOpenChange={(open) => {
                        setIsDeleteDialogOpen(open);
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
                    confirmIcon={Send}
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
                    onTypeFilterChange={setTypeFilter}
                    sortOption={sortOption}
                    onSortOptionChange={setSortOption}
                    dateFrom={dateFrom}
                    onDateFromChange={setDateFrom}
                    dateTo={dateTo}
                    onDateToChange={setDateTo}
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
                            rows={interventionRows}
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
