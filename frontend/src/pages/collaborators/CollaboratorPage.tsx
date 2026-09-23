import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import LoadingPage from "@/components/loadingPage";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import { entityPaths } from "@/lib/entityPaths";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import TableActionButton from "@/components/table-action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CreateCollaboratorDialog, {
    type CollaboratorSubmitValues,
} from "@/components/dialogs/create/createCollaboratorDialog";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import { formatPersonName, toCollaboratorPayload } from "@/lib/people";
import { formatDateTime, openPrintWindow } from "@/lib/utils";
import {
    getCollaborator,
    deleteCollaborator,
    getCollaboratorInterventionsPrintUrl,
    getCollaboratorReportsPrintUrl,
    updateCollaborator,
} from "@/lib/api";
import { useCallback, useState } from "react";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
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
    // Serve anche ai filtri delle due liste sotto, indipendentemente dal caricamento del
    // collaboratore: vedi lo stesso commento in `CustomerPage`.
    const collaboratorId = Number(id);
    const {
        data: collaborator,
        isLoading: isCollaboratorLoading,
        isNotFound,
        reload: reloadCollaborator,
        setData: setCollaborator,
    } = useEntityDetail(id, getCollaborator, {
        backTo: "/collaborators",
        errorMessage: "Impossibile caricare il collaboratore",
    });
    const collaboratorName = collaborator ? formatPersonName(collaborator) : "Collaboratore";
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    useDocumentTitle(collaboratorName);
    const [activeTab, setActiveTab] = useState<ReportsInterventionsTab>("reports");

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

    const handleRefresh = useCallback(async () => {
        await Promise.all([reloadCollaborator(), reloadReports(), reloadInterventions()]);
    }, [reloadCollaborator, reloadInterventions, reloadReports]);

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

    if (isNotFound) {
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
                <TableActionButton size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                    <ArrowLeft className="size-6" />
                </TableActionButton>
                <h1 className="min-w-0 text-2xl font-bold wrap-break-word">{collaboratorName}</h1>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <RefreshButton
                        onRefresh={handleRefresh}
                        isRefreshing={lists.isLoading}
                        label="Aggiorna i dati del collaboratore"
                    />

                    <TableActionButton
                        variant="outline"
                        size="lg"
                        onClick={() => setIsEditDialogOpen(true)}
                        aria-label="Modifica collaboratore"
                    >
                        <Pencil className="size-5" />
                        <span className="hidden text-lg lg:inline">Modifica</span>
                    </TableActionButton>

                    <TableActionButton size="lg" onClick={() => setIsPrintDialogOpen(true)} aria-label={printTitle}>
                        <Printer className="size-5" />
                        <span className="hidden text-lg lg:inline">Stampa</span>
                    </TableActionButton>

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
