import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import EditInterventionDialog, {
    type EditInterventionSubmitValues,
} from "@/components/dialogs/edit/editInterventionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    getApiErrorMessage,
    getCustomer,
    getIntervention,
    getInterventionPrintUrl,
    listCollaborators,
    type InterventionEntityDto,
    updateIntervention,
} from "@/lib/api";
import { formatDate, formatDateTime, openPrintWindow } from "@/lib/utils";
import { toInterventionUpdatePayload } from "@/lib/interventionForm";
import {
    formatInterventionStatus,
    formatInterventionTime,
    formatInterventionType,
    isOnSiteInterventionType,
} from "@/lib/interventions";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

type InterventionPageDetails = {
    intervention: InterventionEntityDto;
    customerName: string;
    customerPhone: string | null;
    collaboratorName: string;
};

const statusBadgeClass = (status: InterventionEntityDto["status"]) => {
    if (status === "completato") {
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    }

    if (status === "in_lavorazione") {
        return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    }

    return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
};

const InterventionPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const interventionId = Number(id);
    const [isLoading, setIsLoading] = useState(true);
    const [details, setDetails] = useState<InterventionPageDetails | null>(null);
    useDocumentTitle(details ? `Intervento #${details.intervention.id} - ${details.customerName}` : "Intervento");
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const hasValidInterventionId = useMemo(
        () => Number.isInteger(interventionId) && interventionId > 0,
        [interventionId]
    );

    const handleBack = () => {
        navigate(-1);
    };

    const handlePrintIntervention = () => {
        if (!details) {
            return;
        }

        openPrintWindow(getInterventionPrintUrl(details.intervention.id));
    };

    const loadDetails = useCallback(async () => {
        const [intervention, collaborators] = await Promise.all([getIntervention(interventionId), listCollaborators()]);

        // Per id e non dentro `listCustomers()`, che senza paginazione si ferma a 5000 righe:
        // stesso motivo della pagina del report.
        const customer = await getCustomer(intervention.customerId).catch(() => null);
        const collaborator = collaborators.find((item) => item.id === intervention.collaboratorId);

        setDetails({
            intervention,
            customerName: customer ? `${customer.firstName} ${customer.lastName ?? ""}`.trim() : "Cliente sconosciuto",
            customerPhone: customer?.phoneNumber ?? customer?.phoneNumberSecondary ?? null,
            collaboratorName: collaborator
                ? `${collaborator.firstName} ${collaborator.lastName ?? ""}`.trim()
                : "Collaboratore sconosciuto",
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
            toast.error("Intervento non valido");
            navigate("/interventions");
            return;
        }

        const loadData = async () => {
            try {
                setIsLoading(true);
                await loadDetails();
            } catch (error) {
                toast.error(getApiErrorMessage(error, "Impossibile caricare l'intervento"));
                navigate("/interventions");
            } finally {
                setIsLoading(false);
            }
        };

        void loadData();
    }, [hasValidInterventionId, navigate, loadDetails]);

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
                                    Intervento #{details.intervention.id} - {details.customerName}
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
                        <span
                            className={`inline-flex rounded-full px-3 py-1 text-2xl font-semibold ${statusBadgeClass(details.intervention.status)}`}
                        >
                            {formatInterventionStatus(details.intervention.status)}
                        </span>
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
