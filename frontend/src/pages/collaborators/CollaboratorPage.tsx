import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import LoadingPage from "@/components/loadingPage";
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
import { formatPersonName, toCollaboratorPayload } from "@/lib/people";
import { formatDateTime, openPrintWindow } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    getApiErrorMessage,
    getApiErrorStatus,
    getCollaborator,
    deleteCollaborator,
    getCollaboratorInterventionsPrintUrl,
    getCollaboratorReportsPrintUrl,
    updateCollaborator,
} from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import type { CollaboratorDto } from "@/types/dtos";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { collaboratorInterventionColumns, collaboratorReportColumns } from "./components/collaborator-detail-columns";
import ReportsInterventionsTabs, { type ReportsInterventionsTab } from "@/components/reports-interventions-tabs";
import { useReportsAndInterventionsOf } from "@/hooks/useReportsAndInterventionsOf";

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
const CollaboratorPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const collaboratorId = Number(id);
    const [isCollaboratorLoading, setIsCollaboratorLoading] = useState(true);
    const [collaborator, setCollaborator] = useState<CollaboratorDto | null>(null);
    const collaboratorName = collaborator ? formatPersonName(collaborator) : "Collaboratore";
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    useDocumentTitle(collaboratorName);
    const [activeTab, setActiveTab] = useState<ReportsInterventionsTab>("reports");

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

    const lists = useReportsAndInterventionsOf({
        owner: { collaboratorId },
        tableKeyPrefix: "collaborator",
        ownerLabel: "del collaboratore",
    });
    const { reload: reloadReports } = lists.reports;
    const { reload: reloadInterventions } = lists.interventions;

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
                        isRefreshing={lists.isLoading}
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

            <ReportsInterventionsTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                lists={lists}
                reportColumns={collaboratorReportColumns}
                interventionColumns={collaboratorInterventionColumns}
                tableKeyPrefix="collaborator"
                ownerNoun="collaboratore"
                onOpenReport={handleOpenReport}
                onOpenIntervention={handleOpenIntervention}
            />
        </div>
    );
};

export default CollaboratorPage;
