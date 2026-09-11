import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import EntityTable from "@/components/entity-table";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import EditReportDialog, { type EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import { toReportUpdatePayload } from "@/lib/reportForm";
import TablePagination from "@/components/table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    createReportTechnician,
    getApiErrorMessage,
    getTechnician,
    listReports,
    deleteReportTechnician,
    updateReport,
    updateReportTechnician,
} from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import type { ReportDto, TechnicianDto } from "@/types/dtos";
import type { ReportVisibilityFilter } from "../reports/components/types";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import OpenEntityButton from "@/components/open-entity-button";
import TableActionButton from "@/components/table-action-button";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { technicianReportColumns } from "./components/technician-detail-columns";

/**
 * La scheda del tecnico esterno: i suoi dati e i report che gli sono stati affidati.
 *
 * Stessa forma della scheda del collaboratore e di quella del cliente: riquadro con i dati
 * (prima mancava, e telefono e partita IVA si leggevano solo dall'elenco tecnici), poi una
 * `EntityTable` con filtro a destra e impaginazione in fondo. La tabella di prima aveva
 * quattro colonne, rientrata di 48px, e non diceva quanto andava pagato il tecnico per
 * ciascun report: la colonna del prezzo è l'aggiunta che conta.
 *
 * Filtro e impaginazione sono del server (`technicianId` sulla lista dei report): l'elenco
 * completo senza paginazione si ferma a 5000 righe, e sul database di sviluppo un tecnico con
 * 179 report aperti ne mostrava 43.
 */
const TechnicianPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const technicianId = Number(id);
    const [isTechnicianLoading, setIsTechnicianLoading] = useState(true);
    const [technician, setTechnician] = useState<TechnicianDto | null>(null);
    const technicianName = technician ? `${technician.firstName} ${technician.lastName ?? ""}`.trim() : "Tecnico";
    useDocumentTitle(technicianName);
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("open");
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [reportToEdit, setReportToEdit] = useState<ReportDto | null>(null);

    const hasValidTechnicianId = useMemo(() => Number.isInteger(technicianId) && technicianId > 0, [technicianId]);

    const handleBack = () => {
        navigate(-1);
    };

    const handleOpenReport = (reportId: number) => {
        navigate(`/reports/${reportId}`);
    };

    const handleOpenEditDialog = (report: ReportDto) => {
        setReportToEdit(report);
        setIsEditDialogOpen(true);
    };

    const [pageSize, setPageSize] = useTableRowsPerPage("technician-reports");
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [visibilityFilter, pageSize],
    });

    const {
        rows: reports,
        totalItems,
        totalPages,
        isInitialLoading: areReportsInitialLoading,
        isRefetching: areReportsRefetching,
        isLoading: areReportsLoading,
        reload: reloadReports,
    } = usePaginatedRows<ReportDto>({
        fetchRows: (signal) =>
            listReports({ page: currentPage, pageSize, visibility: visibilityFilter, technicianId, signal }),
        queryKey: [technicianId, currentPage, pageSize, visibilityFilter],
        errorMessage: "Impossibile caricare i report del tecnico",
        initialLoading: false,
    });

    const handleEditReport = async (values: EditReportSubmitValues) => {
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

        await reloadReports();
    };

    const loadTechnician = useCallback(async () => {
        try {
            setTechnician(await getTechnician(technicianId));
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare il tecnico"));
        }
    }, [technicianId]);

    const handleRefresh = useCallback(async () => {
        await Promise.all([loadTechnician(), reloadReports()]);
    }, [loadTechnician, reloadReports]);

    useEffect(() => {
        if (!hasValidTechnicianId) {
            toast.error("Tecnico non valido");
            navigate("/technicians");
            return;
        }

        // Si aspettano solo i dati del tecnico, che sono l'intestazione: la lista si carica da sé.
        void (async () => {
            setIsTechnicianLoading(true);
            try {
                await loadTechnician();
            } finally {
                setIsTechnicianLoading(false);
            }
        })();
    }, [hasValidTechnicianId, loadTechnician, navigate]);

    if (isTechnicianLoading) {
        return <LoadingPage />;
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-4">
            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                            <ArrowLeft className="size-6" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Torna indietro</TooltipContent>
                </Tooltip>
                <h1 className="min-w-0 text-2xl font-bold wrap-break-word">{technicianName}</h1>
                <RefreshButton
                    onRefresh={handleRefresh}
                    isRefreshing={areReportsLoading}
                    label="Aggiorna i dati del tecnico"
                    className="ml-auto"
                />
            </div>

            {technician ? (
                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Dati del tecnico</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                        <DetailItem label="Telefono" value={technician.phoneNumber ?? "-"} />
                        <DetailItem label="Partita IVA" value={technician.vatNumber ?? "-"} />
                    </CardContent>
                </Card>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-lg font-semibold">Report affidati</h2>
                    <Select
                        value={visibilityFilter}
                        onValueChange={(value) => setVisibilityFilter(value as ReportVisibilityFilter)}
                    >
                        <SelectTrigger className="w-full sm:w-56" aria-label="Filtra i report per stato">
                            <SelectValue placeholder="Filtra per stato" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                            <SelectItem value="all">Tutti i report</SelectItem>
                            <SelectItem value="open">Report aperti</SelectItem>
                            <SelectItem value="closed">Report chiusi</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                    <EntityTable
                        tableKey="technician-reports"
                        columns={technicianReportColumns}
                        rows={reports}
                        getRowKey={(row) => row.id}
                        emptyMessage="Nessun report associato a questo tecnico."
                        renderRowActions={(row) => (
                            <>
                                <OpenEntityButton
                                    size="icon-lg"
                                    onClick={() => handleOpenReport(row.id)}
                                    aria-label={`Apri report ${row.id}`}
                                />
                                <TableActionButton
                                    variant="default"
                                    size="icon-lg"
                                    className="bg-primary/10 hover:bg-primary/20"
                                    onClick={() => handleOpenEditDialog(row)}
                                    aria-label={`Modifica report ${row.id}`}
                                >
                                    <Pencil className="size-5 text-primary" />
                                </TableActionButton>
                            </>
                        )}
                        getRowStatusColor={(row) => (row.closed ? "green" : "red")}
                        onRowOpen={(row) => handleOpenReport(row.id)}
                        isInitialLoading={areReportsInitialLoading}
                        isRefetching={areReportsRefetching}
                        skeletonRowCount={pageSize}
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

            <EditReportDialog
                open={isEditDialogOpen}
                reportId={reportToEdit?.id ?? null}
                customerName={reportToEdit?.customer ?? ""}
                onOpenChange={(open) => {
                    setIsEditDialogOpen(open);
                    if (!open) {
                        setReportToEdit(null);
                    }
                }}
                onSubmit={handleEditReport}
            />
        </div>
    );
};

export default TechnicianPage;
