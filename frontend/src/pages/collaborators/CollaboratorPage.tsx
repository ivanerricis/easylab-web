import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import EntityTable from "@/components/entity-table";
import LoadingPage from "@/components/loadingPage";
import OpenEntityButton from "@/components/open-entity-button";
import RefreshButton from "@/components/refresh-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TablePagination from "@/components/table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiErrorMessage, listCollaborators, listInterventions, listReports } from "@/lib/api";
import { interventionAccentClassName, interventionStatusColor, interventionStatusOptions } from "@/lib/interventions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { InterventionDto, ReportDto } from "@/types/dtos";
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
 */
const CollaboratorPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const collaboratorId = Number(id);
    const [isCollaboratorLoading, setIsCollaboratorLoading] = useState(true);
    const [collaboratorName, setCollaboratorName] = useState("Collaboratore");
    useDocumentTitle(collaboratorName);
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("all");
    const [interventionStatusFilter, setInterventionStatusFilter] = useState<InterventionStatusFilter>("all");

    const hasValidCollaboratorId = useMemo(
        () => Number.isInteger(collaboratorId) && collaboratorId > 0,
        [collaboratorId]
    );

    const handleBack = () => {
        navigate(-1);
    };

    const handleOpenReport = (reportId: number) => {
        navigate(`/reports/${reportId}`);
    };

    const handleOpenIntervention = (interventionId: number) => {
        navigate(`/interventions/${interventionId}`);
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

    const handleRefresh = useCallback(async () => {
        await Promise.all([reloadReports(), reloadInterventions()]);
    }, [reloadInterventions, reloadReports]);

    useEffect(() => {
        if (!hasValidCollaboratorId) {
            toast.error("Collaboratore non valido");
            navigate("/collaborators");
            return;
        }

        // Il nome è l'unica cosa che deve esserci prima di disegnare la pagina: è
        // l'intestazione e il titolo della scheda del browser. Le due liste si caricano da
        // sole e mostrano intanto lo scheletro delle righe, come tutti gli altri elenchi.
        void (async () => {
            setIsCollaboratorLoading(true);

            try {
                const collaborators = await listCollaborators();
                const collaborator = collaborators.find((item) => item.id === collaboratorId);

                if (collaborator) {
                    setCollaboratorName(`${collaborator.firstName} ${collaborator.lastName ?? ""}`.trim());
                }
            } catch (error) {
                toast.error(getApiErrorMessage(error, "Impossibile caricare il collaboratore"));
            } finally {
                setIsCollaboratorLoading(false);
            }
        })();
    }, [collaboratorId, hasValidCollaboratorId, navigate]);

    if (isCollaboratorLoading) {
        return <LoadingPage />;
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                            <ArrowLeft className="size-6" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Torna indietro</TooltipContent>
                </Tooltip>
                <h1 className="text-2xl font-bold">{collaboratorName}</h1>
                <RefreshButton
                    onRefresh={handleRefresh}
                    isRefreshing={areReportsLoading || areInterventionsLoading}
                    label="Aggiorna i dati del collaboratore"
                    className="ml-auto"
                />
            </div>

            <Tabs defaultValue="reports">
                <TabsList>
                    <TabsTrigger value="reports">Report</TabsTrigger>
                    <TabsTrigger value="interventions">Interventi</TabsTrigger>
                </TabsList>

                <TabsContent value="reports" aria-label="Report del collaboratore">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
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

                    {/* Allargando le colonne la tabella può diventare più larga della pagina:
                        deve scorrere qui dentro, perché il contenitore principale del layout ha
                        overflow-x nascosto e la taglierebbe. */}
                    <div className="overflow-x-auto">
                        <EntityTable
                            tableKey="collaborator-reports"
                            columns={collaboratorReportColumns}
                            rows={reportRows}
                            getRowKey={(row) => row.id}
                            emptyMessage="Nessun report associato a questo collaboratore."
                            renderRowActions={(row) => (
                                <OpenEntityButton
                                    size="icon-lg"
                                    onClick={() => handleOpenReport(row.id)}
                                    aria-label={`Apri report ${row.id}`}
                                />
                            )}
                            getRowStatusColor={(row) => (row.closed ? "green" : "red")}
                            getAccentClassName={(row) => (row.closed ? "border-t-green-500" : "border-t-red-500")}
                            onRowOpen={(row) => handleOpenReport(row.id)}
                            isInitialLoading={areReportsInitialLoading}
                            isRefetching={areReportsRefetching}
                            skeletonRowCount={reportsPageSize}
                            titleColumnKey="customer"
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

                <TabsContent value="interventions" aria-label="Interventi del collaboratore">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <Select
                            value={interventionStatusFilter}
                            onValueChange={(value) => setInterventionStatusFilter(value as InterventionStatusFilter)}
                        >
                            <SelectTrigger className="w-full sm:w-56" aria-label="Filtra gli interventi per stato">
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
                    </div>

                    {/* Stesso motivo della tabella dei report. */}
                    <div className="overflow-x-auto">
                        <EntityTable
                            tableKey="collaborator-interventions"
                            columns={collaboratorInterventionColumns}
                            rows={interventionRows}
                            getRowKey={(row) => row.id}
                            emptyMessage="Nessun intervento associato a questo collaboratore."
                            renderRowActions={(row) => (
                                <OpenEntityButton
                                    size="icon-lg"
                                    onClick={() => handleOpenIntervention(row.id)}
                                    aria-label={`Apri intervento ${row.id}`}
                                />
                            )}
                            getRowStatusColor={(row) => interventionStatusColor[row.status]}
                            getAccentClassName={(row) => interventionAccentClassName[row.status]}
                            onRowOpen={(row) => handleOpenIntervention(row.id)}
                            isInitialLoading={areInterventionsInitialLoading}
                            isRefetching={areInterventionsRefetching}
                            skeletonRowCount={interventionsPageSize}
                            titleColumnKey="customer"
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
