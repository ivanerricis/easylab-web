import CreateEntityButton from "@/components/create-entity-button";
import CreateReportDialog, { type CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import EditReportDialog, { type EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import { toReportUpdatePayload } from "@/lib/reportForm";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import PageHeader from "@/components/page-header";
import TablePagination from "@/components/table-pagination";
import {
    createReportTechnician,
    createReport,
    deleteReportTechnician,
    deleteReport,
    getApiErrorMessage,
    getReportPrintUrl,
    updateReport,
    updateReportTechnician,
} from "@/lib/api";
import { useState } from "react";
import type { ReportDto } from "@/types/dtos";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { reportColumns } from "./components/report-columns";
import ReportsFilters from "./components/reports-filters";
import ReportsTable from "./components/reports-table";
import { DEFAULT_REPORT_SORT_OPTION, type ReportSortOption, type ReportVisibilityFilter } from "./components/types";
import { useReportsRows } from "./hooks/useReportsRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { openPrintWindow, trimOrNull } from "@/lib/utils";
import { resolveReportReferences } from "@/lib/reportForm";

const parseVisibilityFilter = (value: string | null): ReportVisibilityFilter => {
    if (value === "all" || value === "open" || value === "closed") {
        return value;
    }

    return "open";
};

const ReportsPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [reportIdToEdit, setReportIdToEdit] = useState<number | null>(null);
    const [reportCustomerNameToEdit, setReportCustomerNameToEdit] = useState("");
    const [reportToDelete, setReportToDelete] = useState<ReportDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>(() =>
        parseVisibilityFilter(searchParams.get("visibility"))
    );
    const [previousSearchParams, setPreviousSearchParams] = useState(searchParams);

    if (previousSearchParams !== searchParams) {
        setPreviousSearchParams(searchParams);
        setVisibilityFilter(parseVisibilityFilter(searchParams.get("visibility")));
    }

    const [searchText, setSearchText] = useState("");
    const [sortOption, setSortOption] = useState<ReportSortOption>(DEFAULT_REPORT_SORT_OPTION);
    const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
    const [dateTo, setDateTo] = useState<string | undefined>(undefined);
    const [pageSize, setPageSize] = useTableRowsPerPage("reports");
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [searchText, visibilityFilter, sortOption, dateFrom, dateTo, pageSize],
    });
    const {
        reportRows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadReports,
        updateReportRow,
    } = useReportsRows({
        searchText,
        visibilityFilter,
        sortOption,
        dateFrom,
        dateTo,
        currentPage,
        pageSize,
    });

    // Niente try/catch: l'errore lo mostra il dialogo, che resta aperto. Qui c'era un
    // `toast.error` seguito da `throw`, e ogni errore compariva due volte.
    const handleCreateReport = async (values: CreateReportSubmitValues) => {
        const { customerId, deviceId, issueId, issueDescription } = await resolveReportReferences(values);

        const createdReport = await createReport({
            deviceId,
            issueId,
            customerId,
            note: trimOrNull(values.notes),
            password: trimOrNull(values.password),
            issueDescription,
            dataBackup: values.dataBackup,
            charger: values.charger,
        });

        await loadReports();

        if (window.confirm("Report creato. Vuoi stamparlo adesso?")) {
            handlePrintReport(createdReport.id);
        }
    };

    const handleOpenDeleteDialog = (report: ReportDto) => {
        setReportToDelete(report);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenReport = (id: number) => {
        navigate(`/reports/${id}`);
    };

    const handleVisibilityFilterChange = (value: ReportVisibilityFilter) => {
        setVisibilityFilter(value);
        setSearchParams(value === "open" ? {} : { visibility: value }, { replace: true });
    };

    const handleOpenEditDialog = (id: number) => {
        const report = reportRows.find((row) => row.id === id);
        setReportIdToEdit(id);
        setReportCustomerNameToEdit(report?.customer ?? "");
        setIsEditDialogOpen(true);
    };

    const handleEditReport = async (values: EditReportSubmitValues) => {
        const technicianTotal = values.technicianId == null ? 0 : values.technicianPrice;

        await updateReport(values.reportId, toReportUpdatePayload(values));

        if (values.technicianId != null) {
            if (values.existingTechnicianId == null) {
                await createReportTechnician({
                    reportId: values.reportId,
                    technicianId: values.technicianId,
                    price: values.technicianPrice,
                });
            } else if (values.existingTechnicianId === values.technicianId) {
                await updateReportTechnician(values.reportId, values.technicianId, values.technicianPrice);
            } else {
                await deleteReportTechnician(values.reportId, values.existingTechnicianId);
                await createReportTechnician({
                    reportId: values.reportId,
                    technicianId: values.technicianId,
                    price: values.technicianPrice,
                });
            }
        } else if (values.existingTechnicianId != null) {
            await deleteReportTechnician(values.reportId, values.existingTechnicianId);
        }

        updateReportRow(values.reportId, (report) => ({
            ...report,
            customerId: values.customerId,
            deviceId: values.deviceId,
            issueId: values.issueId,
            collaboratorId: values.collaboratorId,
            serviceDescription: values.serviceDescription,
            note: values.note,
            password: values.password,
            dataBackup: values.dataBackup,
            charger: values.charger,
            alerted: values.alerted,
            closed: values.closed,
            paymentMethod: values.paymentMethod,
            internalPrice: values.internalPrice,
            technicianPrice: technicianTotal,
            totalPrice: values.internalPrice + technicianTotal,
        }));

        await loadReports();
    };

    const handleDeleteReport = async () => {
        if (!reportToDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteReport(reportToDelete.id);
            toast.success("Report eliminato con successo");
            setIsDeleteDialogOpen(false);
            setReportToDelete(null);
            await loadReports();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile eliminare il report"));
        } finally {
            setIsDeleting(false);
        }
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
                    action={
                        <CreateEntityButton label="Crea nuovo report" onClick={() => setIsCreateDialogOpen(true)} />
                    }
                />

                <CreateReportDialog
                    open={isCreateDialogOpen}
                    onOpenChange={setIsCreateDialogOpen}
                    onSubmit={handleCreateReport}
                />

                <EditReportDialog
                    open={isEditDialogOpen}
                    reportId={reportIdToEdit}
                    customerName={reportCustomerNameToEdit}
                    onOpenChange={(open) => {
                        setIsEditDialogOpen(open);
                        if (!open) {
                            setReportIdToEdit(null);
                            setReportCustomerNameToEdit("");
                        }
                    }}
                    onSubmit={handleEditReport}
                />

                <ConfirmDeleteDialog
                    open={isDeleteDialogOpen}
                    onOpenChange={(open) => {
                        setIsDeleteDialogOpen(open);
                        if (!open) {
                            setReportToDelete(null);
                        }
                    }}
                    title="Elimina report"
                    description={
                        reportToDelete
                            ? `Sei sicuro di voler eliminare il report ID ${reportToDelete.id}?`
                            : "Sei sicuro di voler eliminare questo report?"
                    }
                    isDeleting={isDeleting}
                    onConfirm={handleDeleteReport}
                />

                <ReportsFilters
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    visibilityFilter={visibilityFilter}
                    onVisibilityFilterChange={handleVisibilityFilterChange}
                    sortOption={sortOption}
                    onSortOptionChange={setSortOption}
                    dateFrom={dateFrom}
                    onDateFromChange={setDateFrom}
                    dateTo={dateTo}
                    onDateToChange={setDateTo}
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
                            rows={reportRows}
                            onOpenReport={handleOpenReport}
                            onEditReport={handleOpenEditDialog}
                            onPrintReport={handlePrintReport}
                            onDeleteReport={handleOpenDeleteDialog}
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
