import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import EntityTable from "@/components/entity-table";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EditReportDialog, { type EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import CreateTechnicianDialog, {
    type TechnicianSubmitValues,
} from "@/components/dialogs/create/createTechnicianDialog";
import { formatPersonName, toTechnicianPayload } from "@/lib/people";
import { toReportUpdatePayload } from "@/lib/reportForm";
import TablePagination from "@/components/table-pagination";
import { deleteTechnician, getTechnician, listReports, updateReport, updateTechnician } from "@/lib/api";
import { useCallback, useState } from "react";
import { ArrowLeft, ListFilter, Pencil } from "lucide-react";
import type { ReportDto } from "@/types/dtos";
import type { ReportVisibilityFilter } from "../reports/components/types";
import { useNavigate, useParams } from "react-router-dom";
import OpenEntityButton from "@/components/open-entity-button";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import { entityPaths } from "@/lib/entityPaths";
import TableActionButton from "@/components/table-action-button";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { technicianReportColumns } from "./components/technician-detail-columns";
import { reportStatusColor, reportVisibilityOptions } from "@/lib/reports";
import FilterSelect from "@/components/filters/filter-select";

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
    // Serve anche alla lista dei report sotto (`technicianId`), indipendentemente dal
    // caricamento del tecnico: vedi lo stesso commento in `CustomerPage`.
    const technicianId = Number(id);
    const {
        data: technician,
        isLoading: isTechnicianLoading,
        isNotFound,
        reload: reloadTechnician,
        setData: setTechnician,
    } = useEntityDetail(id, getTechnician, {
        backTo: "/technicians",
        errorMessage: "Impossibile caricare il tecnico",
    });
    const technicianName = technician ? formatPersonName(technician) : "Tecnico";
    useDocumentTitle(technicianName);
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("open");
    const [isEditTechnicianDialogOpen, setIsEditTechnicianDialogOpen] = useState(false);
    // Un solo stato per dialogo + bersaglio: `open={reportToEdit != null}` basta da solo.
    const [reportToEdit, setReportToEdit] = useState<ReportDto | null>(null);

    const handleBack = useGoBack("/technicians");

    const handleOpenReport = (reportId: number) => {
        navigate(entityPaths.report(reportId));
    };

    const handleOpenEditDialog = (report: ReportDto) => {
        setReportToEdit(report);
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
        // D11: l'unica riga dell'ultima pagina eliminata (o un cambio di filtro) non deve
        // lasciare la tabella vuota su una pagina che non esiste più.
        page: currentPage,
        onPageOutOfRange: setCurrentPage,
    });

    const handleEditReport = async (values: EditReportSubmitValues) => {
        await updateReport(values.reportId, toReportUpdatePayload(values));

        await reloadReports();
    };

    // Come nella scheda del cliente: il nome e il riquadro si aggiornano con il tecnico che
    // il server restituisce, senza un secondo giro di rete.
    const handleEditTechnician = async (values: TechnicianSubmitValues) => {
        setTechnician(await updateTechnician(technicianId, toTechnicianPayload(values)));
    };

    const handleRefresh = useCallback(async () => {
        await Promise.all([reloadTechnician(), reloadReports()]);
    }, [reloadTechnician, reloadReports]);

    if (isNotFound) {
        return (
            <NotFoundState
                title="Tecnico non trovato"
                description="Il tecnico che cerchi non esiste, oppure è stato eliminato."
                backTo="/technicians"
                backLabel="Vai ai tecnici esterni"
            />
        );
    }

    if (isTechnicianLoading) {
        return <LoadingPage />;
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-4">
            <div className="flex items-center gap-2">
                <TableActionButton size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                    <ArrowLeft className="size-6" />
                </TableActionButton>
                <h1 className="min-w-0 text-2xl font-bold wrap-break-word">{technicianName}</h1>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <RefreshButton
                        onRefresh={handleRefresh}
                        isRefreshing={areReportsLoading}
                        label="Aggiorna i dati del tecnico"
                    />

                    <TableActionButton
                        variant="outline"
                        size="lg"
                        onClick={() => setIsEditTechnicianDialogOpen(true)}
                        aria-label="Modifica tecnico"
                    >
                        <Pencil className="size-5" />
                        <span className="hidden text-lg lg:inline">Modifica</span>
                    </TableActionButton>

                    <DetailDeleteButton
                        label="Elimina tecnico"
                        title="Elimina tecnico"
                        description={`Sei sicuro di voler eliminare il tecnico ${technicianName}?`}
                        onDelete={() => deleteTechnician(technicianId)}
                        successMessage="Tecnico eliminato con successo"
                        errorMessage="Impossibile eliminare il tecnico"
                        redirectTo="/technicians"
                    />
                </div>
            </div>

            {isEditTechnicianDialogOpen && technician ? (
                <CreateTechnicianDialog
                    open={isEditTechnicianDialogOpen}
                    onOpenChange={setIsEditTechnicianDialogOpen}
                    mode="edit"
                    initialValues={technician}
                    onSubmit={handleEditTechnician}
                />
            ) : null}

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
                {/* Titolo e filtro sulla stessa riga anche su mobile, come tab e filtro nelle
                    schede di cliente e collaboratore. */}
                <div className="flex items-center justify-between gap-2">
                    <h2 className="shrink-0 text-lg font-semibold">Report affidati</h2>
                    <FilterSelect
                        variant="inline"
                        value={visibilityFilter}
                        onValueChange={setVisibilityFilter}
                        options={reportVisibilityOptions}
                        allOption={{ value: "all", label: "Tutti i report" }}
                        label="Filtra i report per stato"
                        icon={ListFilter}
                    />
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
                                    to={entityPaths.report(row.id)}
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
                        getRowStatusColor={(row) => reportStatusColor(row.closed)}
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
        </div>
    );
};

export default TechnicianPage;
