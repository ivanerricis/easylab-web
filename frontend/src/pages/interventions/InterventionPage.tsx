import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import CustomerLink from "@/components/customer-link";
import LoadingPage from "@/components/loadingPage";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import CustomDialog from "@/components/dialogs/customDialog";
import EditInterventionDialog, {
    type EditInterventionSubmitValues,
} from "@/components/dialogs/edit/editInterventionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    getApiErrorMessage,
    getApiErrorStatus,
    getIntervention,
    getInterventionPrintUrl,
    type InterventionEntityDto,
    updateIntervention,
    deleteIntervention,
    sendInterventionEmail,
} from "@/lib/api";
import { formatDate, formatDateTime, formatEuro, openPrintWindow } from "@/lib/utils";
import { toInterventionUpdatePayload } from "@/lib/interventionForm";
import {
    formatInterventionStatus,
    formatInterventionTime,
    formatInterventionType,
    formatPaidStatus,
    formatToInvoiceStatus,
    interventionStatusColor,
    isOnSiteInterventionType,
} from "@/lib/interventions";
import { ArrowLeft, Pencil, Printer, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import StatusBadge from "@/components/status-badge";

type InterventionPageDetails = {
    intervention: InterventionEntityDto;
    customerName: string;
    customerPhone: string | null;
    collaboratorName: string;
};

const InterventionPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const interventionId = Number(id);
    const [isLoading, setIsLoading] = useState(true);
    const [details, setDetails] = useState<InterventionPageDetails | null>(null);
    useDocumentTitle(details ? `Intervento #${details.intervention.id} - ${details.customerName}` : "Intervento");
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const hasValidInterventionId = useMemo(
        () => Number.isInteger(interventionId) && interventionId > 0,
        [interventionId]
    );

    // Un id che non esiste (404) non è un errore da segnalare e da cui scappare: è una scheda
    // da mostrare come "non trovata", lasciando l'indirizzo com'è. Vedi `NotFoundState`.
    const [isNotFound, setIsNotFound] = useState(false);
    const handleBack = useGoBack("/interventions");

    const handlePrintIntervention = () => {
        if (!details) {
            return;
        }

        openPrintWindow(getInterventionPrintUrl(details.intervention.id));
    };

    // Come nell'elenco interventi, da cui prima era l'unica strada: conferma, invio, e l'esito
    // del server (a chi è andata, o perché no) in un avviso.
    const handleConfirmSendEmail = async () => {
        if (!details || isSendingEmail) {
            return;
        }

        try {
            setIsSendingEmail(true);
            const result = await sendInterventionEmail(details.intervention.id);
            toast.success(result.message);
            setIsEmailDialogOpen(false);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile inviare l'email"));
        } finally {
            setIsSendingEmail(false);
        }
    };

    const loadDetails = useCallback(async () => {
        // Una richiesta sola: l'intervento arriva con i nomi di cliente e collaboratore. Prima la
        // pagina scaricava l'elenco intero dei collaboratori, più il cliente a parte.
        const intervention = await getIntervention(interventionId);

        setDetails({
            intervention,
            customerName: intervention.customerName ?? "Cliente sconosciuto",
            customerPhone: intervention.customerPhone,
            collaboratorName: intervention.collaboratorName ?? "Collaboratore sconosciuto",
        });
    }, [interventionId]);

    const handleRefreshIntervention = async () => {
        try {
            await loadDetails();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile aggiornare l'intervento"));
        }
    };

    const handleEditIntervention = async (values: EditInterventionSubmitValues) => {
        await updateIntervention(values.interventionId, toInterventionUpdatePayload(values));

        await loadDetails();
    };

    useEffect(() => {
        if (!hasValidInterventionId) {
            return;
        }

        const loadData = async () => {
            try {
                setIsLoading(true);
                await loadDetails();
            } catch (error) {
                if (getApiErrorStatus(error) === 404) {
                    setIsNotFound(true);
                    return;
                }

                toast.error(getApiErrorMessage(error, "Impossibile caricare l'intervento"));
                navigate("/interventions");
            } finally {
                setIsLoading(false);
            }
        };

        void loadData();
    }, [hasValidInterventionId, navigate, loadDetails]);

    if (!hasValidInterventionId || isNotFound) {
        return (
            <NotFoundState
                title="Intervento non trovato"
                description="L'intervento che cerchi non esiste, oppure è stato eliminato."
                backTo="/interventions"
                backLabel="Vai agli interventi"
            />
        );
    }

    if (isLoading) {
        return <LoadingPage />;
    }

    if (!details) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                Intervento non disponibile.
            </div>
        );
    }

    const isOnSite = isOnSiteInterventionType(details.intervention.type);

    return (
        <div className="flex w-full flex-col gap-4 overflow-auto p-2">
            <div className="border-primary/30">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        size="icon-lg"
                                        variant="ghost"
                                        onClick={handleBack}
                                        className="shrink-0"
                                        aria-label="Torna indietro"
                                    >
                                        <ArrowLeft className="size-6" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Torna indietro</TooltipContent>
                            </Tooltip>

                            <div className="min-w-0">
                                <h1 className="text-xl font-bold tracking-tight wrap-break-word sm:text-2xl">
                                    Intervento #{details.intervention.id} -{" "}
                                    {/* Il nome in alto è il primo che si guarda: è lui a portare al
                                        cliente, e l'anagrafica sotto resta testo per non ripeterlo. */}
                                    <CustomerLink
                                        customerId={details.intervention.customerId}
                                        name={details.customerName}
                                    />
                                </h1>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
                            <RefreshButton onRefresh={handleRefreshIntervention} label="Aggiorna intervento" />

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        onClick={() => setIsEditDialogOpen(true)}
                                        aria-label="Modifica intervento"
                                    >
                                        <Pencil className="size-5" />
                                        <span className="hidden text-lg lg:inline">Modifica</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Modifica intervento</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="lg" onClick={handlePrintIntervention} aria-label="Stampa intervento">
                                        <Printer className="size-5" />
                                        <span className="hidden text-lg lg:inline">Stampa</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stampa intervento</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        onClick={() => setIsEmailDialogOpen(true)}
                                        aria-label="Invia email intervento"
                                    >
                                        <Send className="size-5" />
                                        <span className="hidden text-lg lg:inline">Email</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Invia email intervento</TooltipContent>
                            </Tooltip>

                            <DetailDeleteButton
                                label="Elimina intervento"
                                title="Elimina intervento"
                                description={`Sei sicuro di voler eliminare l'intervento ID ${details.intervention.id}?`}
                                onDelete={() => deleteIntervention(details.intervention.id)}
                                successMessage="Intervento eliminato con successo"
                                errorMessage="Impossibile eliminare l'intervento"
                                redirectTo="/interventions"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/*
                Sotto xl solo i due orari stanno affiancati: stato, tipo e data prendono la riga
                intera, perché "In lavorazione" o "Intervento da remoto" in mezza card uscivano
                dal bordo. Prima erano cinque card una per riga, circa 650px su mobile.
            */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                <Card className="col-span-2 gap-2! border-primary/20 xl:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Stato</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatusBadge size="lg" color={interventionStatusColor[details.intervention.status]}>
                            {formatInterventionStatus(details.intervention.status)}
                        </StatusBadge>
                    </CardContent>
                </Card>

                <Card className="col-span-2 gap-2! border-primary/20 xl:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Tipo intervento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatInterventionType(details.intervention.type)}</p>
                    </CardContent>
                </Card>

                <Card className="col-span-2 gap-2! border-primary/20 xl:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Data intervento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatDate(details.intervention.interventionDate)}</p>
                    </CardContent>
                </Card>

                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Ora inizio</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {isOnSite ? formatInterventionTime(details.intervention.startTime) : "-"}
                        </p>
                    </CardContent>
                </Card>

                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Ora fine</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {isOnSite ? formatInterventionTime(details.intervention.endTime) : "-"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Anagrafica</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                        <DetailItem label="Cliente" value={details.customerName} />
                        <DetailItem label="Telefono" value={details.customerPhone ?? "-"} />
                        <DetailItem label="Collaboratore" value={details.collaboratorName} />
                    </CardContent>
                </Card>

                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Dettagli</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {isOnSite ? <DetailItem label="Problema" value={details.intervention.problem ?? "-"} /> : null}
                        <DetailItem label="Descrizione" value={details.intervention.description ?? "-"} />
                        <DetailItem label="Note" value={details.intervention.note ?? "-"} />
                        <DetailItem
                            label="Prezzo"
                            value={details.intervention.price != null ? formatEuro(details.intervention.price) : "-"}
                        />
                        <DetailItem label="Pagamento" value={formatPaidStatus(details.intervention.paid)} />
                        <DetailItem
                            label="Da fatturare"
                            value={formatToInvoiceStatus(details.intervention.toInvoice)}
                        />
                        <DetailItem label="Creato il" value={formatDateTime(details.intervention.created_at)} />
                        <DetailItem
                            label="Ultimo aggiornamento"
                            value={
                                details.intervention.updated_at ? formatDateTime(details.intervention.updated_at) : "-"
                            }
                        />
                    </CardContent>
                </Card>
            </div>

            <CustomDialog
                open={isEmailDialogOpen}
                onOpenChange={setIsEmailDialogOpen}
                title="Invia email intervento"
                description={`Sei sicuro di voler inviare l'email per l'intervento ID ${details.intervention.id}?`}
                confirmLabel="Invia"
                confirmIcon={Send}
                cancelLabel="Annulla"
                confirmDisabled={isSendingEmail}
                onCancel={() => setIsEmailDialogOpen(false)}
                onConfirm={handleConfirmSendEmail}
            />

            <EditInterventionDialog
                open={isEditDialogOpen}
                interventionId={details.intervention.id}
                customerName={details.customerName}
                onOpenChange={setIsEditDialogOpen}
                onSubmit={handleEditIntervention}
            />
        </div>
    );
};

export default InterventionPage;
