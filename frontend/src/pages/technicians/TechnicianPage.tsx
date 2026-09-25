import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem, { DetailGrid, DetailSection } from "@/components/detail-item";
import { DetailHeader, DetailHeaderAction } from "@/components/detail-header";
import EntityTable from "@/components/entity-table";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import EditReportDialog, { type EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import CreateTechnicianDialog, {
    type TechnicianSubmitValues,
} from "@/components/dialogs/create/createTechnicianDialog";
import { formatPersonName, toTechnicianPayload } from "@/lib/people";
import { toReportUpdatePayload } from "@/lib/reportForm";
import TablePagination from "@/components/table-pagination";
import { deleteTechnician, getTechnician, listReports, updateReport, updateTechnician } from "@/lib/api";
import { useCallback, useState } from "react";
import { ListFilter, Pencil } from "lucide-react";
import type { ReportDto } from "@/types/dtos";
import type { ReportVisibilityFilter } from "../reports/components/types";
import { useNavigate, useParams } from "react-router-dom";
import OpenEntityButton from "@/components/open-entity-button";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
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
    // Sotto `sm` il nome sta nella card dei dati invece che nell'intestazione (`hideTitleOnMobile`).
    const isPhone = useIsMobile(640);
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
            {/* Solo quando c'è la card dei dati a ospitare il nome: altrimenti su telefono la
                pagina resterebbe senza titolo. */}
            <DetailHeader onBack={handleBack} title={technicianName} hideTitleOnMobile={technician != null}>
                <RefreshButton
                    onRefresh={handleRefresh}
                    isRefreshing={areReportsLoading}
                    label="Aggiorna i dati del tecnico"
                />

                <DetailHeaderAction
                    variant="outline"
                    icon={Pencil}
                    text="Modifica"
                    onClick={() => setIsEditTechnicianDialogOpen(true)}
                    aria-label="Modifica tecnico"
                />

                <DetailDeleteButton
                    label="Elimina tecnico"
                    title="Elimina tecnico"
                    description={`Sei sicuro di voler eliminare il tecnico ${technicianName}?`}
                    onDelete={() => deleteTechnician(technicianId)}
                    successMessage="Tecnico eliminato con successo"
                    errorMessage="Impossibile eliminare il tecnico"
                    redirectTo="/technicians"
                />
            </DetailHeader>

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
                <DetailSection
                    title={
                        // Su telefono il nome sta qui invece che nell'intestazione (vedi
                        // `hideTitleOnMobile`), come nella scheda cliente: a 390px freccia, titolo e
                        // quattro pulsanti non stanno su una riga, e il nome finiva spezzato su due o
                        // tre righe con le azioni spinte sotto.
                        isPhone ? (
                            // L'`h1` della pagina sotto `sm`: vedi `hideTitleOnMobile`.
                            <h1 className="min-w-0 text-lg wrap-break-word">{technicianName}</h1>
                        ) : (
                            "Dati del tecnico"
                        )
                    }
                >
                    {/* A righe come la scheda report, su più colonne come la scheda cliente, così le
                        righe hanno la stessa lunghezza in tutte le schede (vedi `DetailGrid`). */}
                    <DetailGrid layout="rows" className="sm:grid-cols-2 xl:grid-cols-3">
                        <DetailItem label="Telefono" value={technician.phoneNumber ?? "-"} />
                        <DetailItem label="Partita IVA" value={technician.vatNumber ?? "-"} />
                    </DetailGrid>
                </DetailSection>
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
                        // Il filtro parte da "aperti": senza nominarlo, un tecnico con soli report
                        // chiusi sembrava non averne mai avuti.
                        emptyMessage={resolveEmptyListMessage({
                            emptyMessage: "Nessun report associato a questo tecnico.",
                            hasActiveFilters: visibilityFilter !== "all",
                            filteredMessage: "Nessun report di questo tecnico corrisponde al filtro.",
                        })}
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
                                    className="bg-muted hover:bg-primary/20"
                                    onClick={() => handleOpenEditDialog(row)}
                                    aria-label={`Modifica report ${row.id}`}
                                >
                                    <Pencil className="size-5 text-muted-foreground transition-colors group-hover/button:text-primary" />
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
