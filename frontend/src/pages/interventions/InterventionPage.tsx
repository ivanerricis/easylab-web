import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import CustomerLink from "@/components/customer-link";
import LoadingPage from "@/components/loadingPage";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import TableActionButton from "@/components/table-action-button";
import CustomDialog from "@/components/dialogs/customDialog";
import EditInterventionDialog, {
    type EditInterventionSubmitValues,
} from "@/components/dialogs/edit/editInterventionDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    getApiErrorMessage,
    getIntervention,
    getInterventionPrintUrl,
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
import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import StatusBadge from "@/components/status-badge";

const InterventionPage = () => {
    const { id } = useParams();
    // Una richiesta sola: l'intervento arriva con i nomi di cliente e collaboratore.
    // `useEntityDetail` tiene id, 404 e ritorno all'elenco su altri errori.
    const {
        data: intervention,
        isLoading,
        isNotFound,
        reload,
    } = useEntityDetail(id, getIntervention, {
        backTo: "/interventions",
        errorMessage: "Impossibile caricare l'intervento",
    });
    useDocumentTitle(
        intervention
            ? `Intervento #${intervention.id} - ${intervention.customerName ?? "Cliente sconosciuto"}`
            : "Intervento"
    );
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const handleBack = useGoBack("/interventions");

    const handlePrintIntervention = () => {
        if (!intervention) {
            return;
        }

        openPrintWindow(getInterventionPrintUrl(intervention.id));
    };

    // Come nell'elenco interventi, da cui prima era l'unica strada: conferma, invio, e l'esito
    // del server (a chi è andata, o perché no) in un avviso.
    const handleConfirmSendEmail = async () => {
        if (!intervention || isSendingEmail) {
            return;
        }

        try {
            setIsSendingEmail(true);
            const result = await sendInterventionEmail(intervention.id);
            toast.success(result.message);
            setIsEmailDialogOpen(false);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile inviare l'email"));
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleEditIntervention = async (values: EditInterventionSubmitValues) => {
        await updateIntervention(values.interventionId, toInterventionUpdatePayload(values));

        await reload();
    };

    if (isNotFound) {
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

    if (!intervention) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                Intervento non disponibile.
            </div>
        );
    }

    const isOnSite = isOnSiteInterventionType(intervention.type);

    return (
        <div className="flex w-full flex-col gap-4 overflow-auto p-2">
            <div className="border-primary/30">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <TableActionButton
                                size="icon-lg"
                                variant="ghost"
                                onClick={handleBack}
                                className="shrink-0"
                                aria-label="Torna indietro"
                            >
                                <ArrowLeft className="size-6" />
                            </TableActionButton>

                            <div className="min-w-0">
                                <h1 className="text-xl font-bold tracking-tight wrap-break-word sm:text-2xl">
                                    Intervento #{intervention.id} -{" "}
                                    {/* Il nome in alto è il primo che si guarda: è lui a portare al
                                        cliente, e l'anagrafica sotto resta testo per non ripeterlo. */}
                                    <CustomerLink
                                        customerId={intervention.customerId}
                                        name={intervention.customerName ?? "Cliente sconosciuto"}
                                    />
                                </h1>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
                            <RefreshButton onRefresh={reload} label="Aggiorna intervento" />

                            <TableActionButton
                                variant="outline"
                                size="lg"
                                onClick={() => setIsEditDialogOpen(true)}
                                aria-label="Modifica intervento"
                            >
                                <Pencil className="size-5" />
                                <span className="hidden text-lg lg:inline">Modifica</span>
                            </TableActionButton>

                            <TableActionButton
                                size="lg"
                                onClick={handlePrintIntervention}
                                aria-label="Stampa intervento"
                            >
                                <Printer className="size-5" />
                                <span className="hidden text-lg lg:inline">Stampa</span>
                            </TableActionButton>

                            <TableActionButton
                                variant="outline"
                                size="lg"
                                onClick={() => setIsEmailDialogOpen(true)}
                                aria-label="Invia email intervento"
                            >
                                <Send className="size-5" />
                                <span className="hidden text-lg lg:inline">Email</span>
                            </TableActionButton>

                            <DetailDeleteButton
                                label="Elimina intervento"
                                title="Elimina intervento"
                                description={`Sei sicuro di voler eliminare l'intervento ID ${intervention.id}?`}
                                onDelete={() => deleteIntervention(intervention.id)}
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
                        <StatusBadge size="lg" color={interventionStatusColor[intervention.status]}>
                            {formatInterventionStatus(intervention.status)}
                        </StatusBadge>
                    </CardContent>
                </Card>

                <Card className="col-span-2 gap-2! border-primary/20 xl:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Tipo intervento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatInterventionType(intervention.type)}</p>
                    </CardContent>
                </Card>

                <Card className="col-span-2 gap-2! border-primary/20 xl:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Data intervento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatDate(intervention.interventionDate)}</p>
                    </CardContent>
                </Card>

                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Ora inizio</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {isOnSite ? formatInterventionTime(intervention.startTime) : "-"}
                        </p>
                    </CardContent>
                </Card>

                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Ora fine</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {isOnSite ? formatInterventionTime(intervention.endTime) : "-"}
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
                        <DetailItem label="Cliente" value={intervention.customerName ?? "Cliente sconosciuto"} />
                        <DetailItem label="Telefono" value={intervention.customerPhone ?? "-"} />
                        <DetailItem
                            label="Collaboratore"
                            value={intervention.collaboratorName ?? "Collaboratore sconosciuto"}
                        />
                    </CardContent>
                </Card>

                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Dettagli</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {isOnSite ? <DetailItem label="Problema" value={intervention.problem ?? "-"} /> : null}
                        <DetailItem label="Descrizione" value={intervention.description ?? "-"} />
                        <DetailItem label="Note" value={intervention.note ?? "-"} />
                        <DetailItem
                            label="Prezzo"
                            value={intervention.price != null ? formatEuro(intervention.price) : "-"}
                        />
                        <DetailItem label="Pagamento" value={formatPaidStatus(intervention.paid)} />
                        <DetailItem label="Da fatturare" value={formatToInvoiceStatus(intervention.toInvoice)} />
                        <DetailItem label="Creato il" value={formatDateTime(intervention.created_at)} />
                        <DetailItem
                            label="Ultimo aggiornamento"
                            value={intervention.updated_at ? formatDateTime(intervention.updated_at) : "-"}
                        />
                    </CardContent>
                </Card>
            </div>

            <CustomDialog
                open={isEmailDialogOpen}
                onOpenChange={setIsEmailDialogOpen}
                title="Invia email intervento"
                description={`Sei sicuro di voler inviare l'email per l'intervento ID ${intervention.id}?`}
                confirmLabel="Invia"
                confirmIcon={Send}
                cancelLabel="Annulla"
                confirmDisabled={isSendingEmail}
                onCancel={() => setIsEmailDialogOpen(false)}
                onConfirm={handleConfirmSendEmail}
            />

            <EditInterventionDialog
                open={isEditDialogOpen}
                interventionId={intervention.id}
                customerName={intervention.customerName ?? "Cliente sconosciuto"}
                onOpenChange={setIsEditDialogOpen}
                onSubmit={handleEditIntervention}
            />
        </div>
    );
};

export default InterventionPage;
