import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import EntityTable from "@/components/entity-table";
import LoadingPage from "@/components/loadingPage";
import OpenEntityButton from "@/components/open-entity-button";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import { entityPaths } from "@/lib/entityPaths";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CreateCollaboratorDialog, {
    type CollaboratorSubmitValues,
} from "@/components/dialogs/create/createCollaboratorDialog";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import { toCollaboratorPayload } from "@/lib/people";
import { formatDateTime, openPrintWindow } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TablePagination from "@/components/table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    getApiErrorMessage,
    getApiErrorStatus,
    getCollaborator,
    deleteCollaborator,
    getCollaboratorInterventionsPrintUrl,
    getCollaboratorReportsPrintUrl,
    listInterventions,
    listReports,
    updateCollaborator,
} from "@/lib/api";
import { interventionStatusColor, interventionStatusOptions } from "@/lib/interventions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import type { CollaboratorDto, InterventionDto, ReportDto } from "@/types/dtos";
import type { ReportVisibilityFilter } from "../reports/components/types";
import type { InterventionStatusFilter } from "../interventions/components/types";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { collaboratorInterventionColumns, collaboratorReportColumns } from "./components/collaborator-detail-columns";

/**
 * La scheda del collaboratore: due sezioni, i report che ha portato e gli interventi che gli
 * sono assegnati.
 *
 * Gli interventi erano l'assente. Il collaboratore è la persona che li esegue —
 * `collaboratorId` è obbligatorio su ogni intervento — ma la sua scheda mostrava solo i
 * report, e per sapere cosa avesse in agenda bisognava tornare all'elenco generale e
 * cercarlo a mano: il dato c'era, la strada per arrivarci no.
 *
 * Le due liste sono `EntityTable` come tutti gli altri elenchi dell'applicazione: stesse
 * colonne ridimensionabili e ricordate, stesse schede sotto `sm`, stesso conteggio in fondo.
 * Prima i report erano riquadri affiancati con tre soli campi (cliente, dispositivo, stato),
 * senza telefono, difetto né data, e senza modo di aggiungerne: una forma tutta sua in
 * un'applicazione fatta di tabelle.
 *
 * Filtro e impaginazione sono del server. Prima la pagina chiedeva l'elenco completo dei
 * report e lo filtrava nel browser, ma "completo" senza paginazione si ferma a
 * `unpaginatedMaxRows` (5000) righe della tabella intera: sul database di sviluppo, che ne ha
 * 20000, il collaboratore con 1198 report ne mostrava 305 — e il conteggio in fondo diceva
 * 305, senza alcun segnale che il resto fosse stato tagliato via.
 *
 * Le due sezioni stanno in tab invece che una sopra l'altra. Con la paginazione il numero di
 * righe a schermo non cresce mai, ma la pagina sì: filtro, tabella e impaginazione di
 * entrambe le liste insieme rendevano la scheda lunga da scorrere anche per un collaboratore
 * con pochi report. Il tab dei report è quello di default perché è la vista più cercata.
 *
 * In alto, come nella scheda del cliente, i dati del collaboratore e i pulsanti per modificarli
 * e per stampare il resoconto del tab aperto: prima la scheda mostrava solo il nome, e per
 * leggere il telefono o correggerlo bisognava tornare all'elenco.
 */
type CollaboratorTab = "reports" | "interventions";

const CollaboratorPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const collaboratorId = Number(id);
    const [isCollaboratorLoading, setIsCollaboratorLoading] = useState(true);
    const [collaborator, setCollaborator] = useState<CollaboratorDto | null>(null);
    const collaboratorName = collaborator
        ? `${collaborator.firstName} ${collaborator.lastName ?? ""}`.trim()
        : "Collaboratore";
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    useDocumentTitle(collaboratorName);
    const [activeTab, setActiveTab] = useState<CollaboratorTab>("reports");
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("all");
    const [interventionStatusFilter, setInterventionStatusFilter] = useState<InterventionStatusFilter>("all");

    const hasValidCollaboratorId = useMemo(
        () => Number.isInteger(collaboratorId) && collaboratorId > 0,
        [collaboratorId]
    );

    // Vedi lo stesso stato in `ReportPage`: un collaboratore che non esiste si mostra come tale.
    const [isNotFound, setIsNotFound] = useState(false);
    const handleBack = useGoBack("/collaborators");

    const handleOpenReport = (reportId: number) => {
        navigate(entityPaths.report(reportId));
    };

    const handleOpenIntervention = (interventionId: number) => {
        navigate(entityPaths.intervention(interventionId));
    };

    // Le due sezioni si impaginano per conto proprio: righe per pagina e pagina corrente sono
    // separate, altrimenti sfogliare i report riporterebbe gli interventi alla prima pagina.
    const [reportsPageSize, setReportsPageSize] = useTableRowsPerPage("collaborator-reports");
    const { currentPage: reportsPage, setCurrentPage: setReportsPage } = useTablePagination({
        resetDependencies: [visibilityFilter, reportsPageSize],
    });

    const [interventionsPageSize, setInterventionsPageSize] = useTableRowsPerPage("collaborator-interventions");
    const { currentPage: interventionsPage, setCurrentPage: setInterventionsPage } = useTablePagination({
        resetDependencies: [interventionStatusFilter, interventionsPageSize],
    });

    const {
        rows: reportRows,
        totalItems: reportsTotalItems,
        totalPages: reportsTotalPages,
        isInitialLoading: areReportsInitialLoading,
        isRefetching: areReportsRefetching,
        isLoading: areReportsLoading,
        reload: reloadReports,
    } = usePaginatedRows<ReportDto>({
        fetchRows: (signal) =>
            listReports({
                page: reportsPage,
                pageSize: reportsPageSize,
                visibility: visibilityFilter,
                collaboratorId,
                signal,
            }),
        queryKey: [collaboratorId, reportsPage, reportsPageSize, visibilityFilter],
        errorMessage: "Impossibile caricare i report del collaboratore",
        initialLoading: false,
    });

    const {
        rows: interventionRows,
        totalItems: interventionsTotalItems,
        totalPages: interventionsTotalPages,
        isInitialLoading: areInterventionsInitialLoading,
        isRefetching: areInterventionsRefetching,
        isLoading: areInterventionsLoading,
        reload: reloadInterventions,
    } = usePaginatedRows<InterventionDto>({
        fetchRows: (signal) =>
            listInterventions({
                page: interventionsPage,
                pageSize: interventionsPageSize,
                status: interventionStatusFilter,
                collaboratorId,
                signal,
            }),
        queryKey: [collaboratorId, interventionsPage, interventionsPageSize, interventionStatusFilter],
        errorMessage: "Impossibile caricare gli interventi del collaboratore",
        initialLoading: false,
    });

    const loadCollaborator = useCallback(async () => {
        try {
            // Per id, come la scheda del tecnico: prima si scaricava l'elenco intero dei
            // collaboratori per usarne uno.
            setCollaborator(await getCollaborator(collaboratorId));
        } catch (error) {
            if (getApiErrorStatus(error) === 404) {
                setIsNotFound(true);
                return;
            }

            toast.error(getApiErrorMessage(error, "Impossibile caricare il collaboratore"));
        }
    }, [collaboratorId]);

    const handleRefresh = useCallback(async () => {
        await Promise.all([loadCollaborator(), reloadReports(), reloadInterventions()]);
    }, [loadCollaborator, reloadInterventions, reloadReports]);

    const handleEditCollaborator = async (values: CollaboratorSubmitValues) => {
        setCollaborator(await updateCollaborator(collaboratorId, toCollaboratorPayload(values)));
    };

    // La stampa segue il tab, come nella scheda del cliente.
    const printTitle = activeTab === "interventions" ? "Stampa resoconto interventi" : "Stampa resoconto report";

    const handleConfirmPrint = (range: { dateFrom?: string; dateTo?: string }) => {
        openPrintWindow(
            activeTab === "interventions"
                ? getCollaboratorInterventionsPrintUrl(collaboratorId, range)
                : getCollaboratorReportsPrintUrl(collaboratorId, range)
        );
    };

    useEffect(() => {
        if (!hasValidCollaboratorId) {
            return;
        }

        // I dati del collaboratore sono l'intestazione e il riquadro in alto: è l'unica cosa
        // che si aspetta prima di disegnare la pagina. Le due liste si caricano da sole.
        void (async () => {
            setIsCollaboratorLoading(true);
            try {
                await loadCollaborator();
            } finally {
                setIsCollaboratorLoading(false);
            }
        })();
    }, [hasValidCollaboratorId, loadCollaborator]);

    if (!hasValidCollaboratorId || isNotFound) {
        return (
            <NotFoundState
                title="Collaboratore non trovato"
                description="Il collaboratore che cerchi non esiste, oppure è stato eliminato."
                backTo="/collaborators"
                backLabel="Vai ai collaboratori"
            />
        );
    }

    if (isCollaboratorLoading) {
        return <LoadingPage />;
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-4">
            <PrintRangeDialog
                open={isPrintDialogOpen}
                onOpenChange={setIsPrintDialogOpen}
                title={printTitle}
                onConfirm={handleConfirmPrint}
            />

            {isEditDialogOpen && collaborator ? (
                <CreateCollaboratorDialog
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    mode="edit"
                    initialValues={collaborator}
                    onSubmit={handleEditCollaborator}
                />
            ) : null}

            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                            <ArrowLeft className="size-6" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Torna indietro</TooltipContent>
                </Tooltip>
                <h1 className="min-w-0 text-2xl font-bold wrap-break-word">{collaboratorName}</h1>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <RefreshButton
                        onRefresh={handleRefresh}
                        isRefreshing={areReportsLoading || areInterventionsLoading}
                        label="Aggiorna i dati del collaboratore"
                    />

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="lg"
                                onClick={() => setIsEditDialogOpen(true)}
                                aria-label="Modifica collaboratore"
                            >
                                <Pencil className="size-5" />
                                <span className="hidden text-lg lg:inline">Modifica</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifica collaboratore</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="lg" onClick={() => setIsPrintDialogOpen(true)} aria-label={printTitle}>
                                <Printer className="size-5" />
                                <span className="hidden text-lg lg:inline">Stampa</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{printTitle}</TooltipContent>
                    </Tooltip>

                    <DetailDeleteButton
                        label="Elimina collaboratore"
                        title="Elimina collaboratore"
                        description={`Sei sicuro di voler eliminare il collaboratore ${collaboratorName}?`}
                        onDelete={() => deleteCollaborator(collaboratorId)}
                        successMessage="Collaboratore eliminato con successo"
                        errorMessage="Impossibile eliminare il collaboratore"
                        redirectTo="/collaborators"
                    />
                </div>
            </div>

            {collaborator ? (
                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Dati del collaboratore</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                        <DetailItem label="Telefono" value={collaborator.phoneNumber ?? "-"} />
                        <DetailItem label="Collaboratore dal" value={formatDateTime(collaborator.createdAt)} />
                    </CardContent>
                </Card>
            ) : null}

            <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as CollaboratorTab)}
                className="min-h-0 flex-1"
            >
                {/* Tab e filtro sulla stessa riga, anche su mobile: su due righe il filtro
                    sembrava un controllo a sé, staccato dalla lista che filtra, e toglieva una
                    riga alla tabella. Il filtro è uno solo e mostra le voci del tab aperto. */}
                <div className="flex items-center justify-between gap-2">
                    <TabsList>
                        <TabsTrigger value="reports" className="px-2 sm:px-3">
                            Report
                        </TabsTrigger>
                        <TabsTrigger value="interventions" className="px-2 sm:px-3">
                            Interventi
                        </TabsTrigger>
                    </TabsList>
                    {activeTab === "interventions" ? (
                        <Select
                            value={interventionStatusFilter}
                            onValueChange={(value) => setInterventionStatusFilter(value as InterventionStatusFilter)}
                        >
                            <SelectTrigger
                                className="min-w-0 flex-1 text-base sm:w-56 sm:flex-none sm:text-lg"
                                aria-label="Filtra gli interventi per stato"
                            >
                                <SelectValue placeholder="Filtra per stato" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                <SelectItem value="all">Tutti gli interventi</SelectItem>
                                {interventionStatusOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Select
                            value={visibilityFilter}
                            onValueChange={(value) => setVisibilityFilter(value as ReportVisibilityFilter)}
                        >
                            <SelectTrigger
                                className="min-w-0 flex-1 text-base sm:w-56 sm:flex-none sm:text-lg"
                                aria-label="Filtra i report per stato"
                            >
                                <SelectValue placeholder="Filtra per stato" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                <SelectItem value="all">Tutti i report</SelectItem>
                                <SelectItem value="open">Report aperti</SelectItem>
                                <SelectItem value="closed">Report chiusi</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>

                <TabsContent value="reports" aria-label="Report del collaboratore" className="min-h-0 flex-1">
                    {/* Come nelle altre pagine a elenco: quest'area scorre da sola (in
                        entrambe le direzioni — il contenitore principale del layout ha
                        overflow-x nascosto, e allargando le colonne la tabella può diventare
                        più larga della pagina), lasciando l'impaginazione ferma in fondo
                        invece di farla scorrere via con la tabella. */}
                    <div className="min-h-0 flex-1 overflow-auto">
                        <EntityTable
                            tableKey="collaborator-reports"
                            columns={collaboratorReportColumns}
                            rows={reportRows}
                            getRowKey={(row) => row.id}
                            emptyMessage="Nessun report associato a questo collaboratore."
                            renderRowActions={(row) => (
                                <OpenEntityButton
                                    size="icon-lg"
                                    to={entityPaths.report(row.id)}
                                    aria-label={`Apri report ${row.id}`}
                                />
                            )}
                            getRowStatusColor={(row) => (row.closed ? "green" : "red")}
                            onRowOpen={(row) => handleOpenReport(row.id)}
                            isInitialLoading={areReportsInitialLoading}
                            isRefetching={areReportsRefetching}
                            skeletonRowCount={reportsPageSize}
                        />
                    </div>

                    <TablePagination
                        currentPage={reportsPage}
                        totalPages={reportsTotalPages}
                        totalItems={reportsTotalItems}
                        pageSize={reportsPageSize}
                        onPageChange={setReportsPage}
                        onPageSizeChange={setReportsPageSize}
                    />
                </TabsContent>

                <TabsContent value="interventions" aria-label="Interventi del collaboratore" className="min-h-0 flex-1">
                    {/* Stesso motivo della tabella dei report. */}
                    <div className="min-h-0 flex-1 overflow-auto">
                        <EntityTable
                            tableKey="collaborator-interventions"
                            columns={collaboratorInterventionColumns}
                            rows={interventionRows}
                            getRowKey={(row) => row.id}
                            emptyMessage="Nessun intervento associato a questo collaboratore."
                            renderRowActions={(row) => (
                                <OpenEntityButton
                                    size="icon-lg"
                                    to={entityPaths.intervention(row.id)}
                                    aria-label={`Apri intervento ${row.id}`}
                                />
                            )}
                            getRowStatusColor={(row) => interventionStatusColor[row.status]}
                            onRowOpen={(row) => handleOpenIntervention(row.id)}
                            isInitialLoading={areInterventionsInitialLoading}
                            isRefetching={areInterventionsRefetching}
                            skeletonRowCount={interventionsPageSize}
                        />
                    </div>

                    <TablePagination
                        currentPage={interventionsPage}
                        totalPages={interventionsTotalPages}
                        totalItems={interventionsTotalItems}
                        pageSize={interventionsPageSize}
                        onPageChange={setInterventionsPage}
                        onPageSizeChange={setInterventionsPageSize}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default CollaboratorPage;
