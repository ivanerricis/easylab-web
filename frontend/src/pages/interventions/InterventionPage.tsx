import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem, { DetailGrid, DetailSection } from "@/components/detail-item";
import { DetailHeader, DetailHeaderAction } from "@/components/detail-header";
import DetailStats, { DetailStatBadge } from "@/components/detail-stats";
import CustomerLink from "@/components/customer-link";
import EntityDetailGate from "@/components/entity-detail-gate";
import { useGoBack } from "@/hooks/useGoBack";
import { usePendingAction } from "@/hooks/usePendingAction";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import CustomDialog from "@/components/dialogs/customDialog";
import EditInterventionDialog, {
    type EditInterventionSubmitValues,
} from "@/components/dialogs/edit/editInterventionDialog";
import {
    getIntervention,
    getInterventionPrintUrl,
    updateIntervention,
    deleteIntervention,
    sendInterventionEmail,
} from "@/lib/api";
import { cn, formatDate, formatDateTime, formatEuro, openPrintWindow } from "@/lib/utils";
import { toInterventionUpdatePayload } from "@/lib/interventionForm";
import {
    formatInterventionStatus,
    formatInterventionTime,
    formatInterventionType,
    formatPaidStatus,
    formatToInvoiceStatus,
    interventionStatusColor,
    interventionDescriptionLabel,
    isAssistanceInterventionType,
} from "@/lib/interventions";
import { Mail, Pencil, Printer } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

const InterventionPage = () => {
    const { id } = useParams();
    // Una richiesta sola: l'intervento arriva con i nomi di cliente e collaboratore.
    // `useEntityDetail` tiene id, 404 e ritorno all'elenco su altri errori.
    const {
        data: intervention,
        isLoading,
        isReloading,
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
    // Come nell'elenco interventi, da cui prima era l'unica strada: conferma, invio, e l'esito
    // del server (a chi è andata, o perché no) in un avviso.
    const emailAction = usePendingAction({
        run: (interventionId: number) => sendInterventionEmail(interventionId),
        successMessage: (_, result) => result.message,
        errorMessage: "Impossibile inviare l'email",
    });

    const handleBack = useGoBack("/interventions");

    const handlePrintIntervention = () => {
        if (!intervention) {
            return;
        }

        openPrintWindow(getInterventionPrintUrl(intervention.id));
    };

    const handleEditIntervention = async (values: EditInterventionSubmitValues) => {
        await updateIntervention(values.interventionId, toInterventionUpdatePayload(values));

        await reload();
    };

    // Il caricamento a tutta pagina solo senza dati: sui ricaricamenti (Aggiorna, dopo "Salva")
    // la scheda resta, attenuata. Vedi lo stesso commento in `ReportPage`.
    if (isNotFound || !intervention) {
        return (
            <EntityDetailGate
                isNotFound={isNotFound}
                isLoading={isLoading}
                notFound={{
                    title: "Intervento non trovato",
                    description: "L'intervento che cerchi non esiste, oppure è stato eliminato.",
                    backTo: "/interventions",
                    backLabel: "Vai agli interventi",
                }}
                unavailableLabel="Intervento non disponibile."
            />
        );
    }

    const isAssistance = isAssistanceInterventionType(intervention.type);

    // Il titolo va in due posti a seconda della larghezza: nell'intestazione da `sm` in su, in
    // cima al riepilogo sotto (vedi `hideTitleOnMobile`).
    const pageTitle = (
        <>
            Intervento #{intervention.id} -{" "}
            {/* Il nome è il primo che si guarda: è lui a portare al cliente, e l'anagrafica
                sotto resta testo per non ripeterlo. */}
            <CustomerLink
                customerId={intervention.customerId}
                name={intervention.customerName ?? "Cliente sconosciuto"}
            />
        </>
    );

    return (
        // Scorre il `main` del layout, come nella scheda del report: vedi il commento lì.
        <div className="flex w-full flex-col gap-4 self-start">
            <DetailHeader onBack={handleBack} hideTitleOnMobile title={pageTitle}>
                <RefreshButton onRefresh={reload} label="Aggiorna intervento" />

                <DetailHeaderAction
                    variant="outline"
                    icon={Pencil}
                    text="Modifica"
                    onClick={() => setIsEditDialogOpen(true)}
                    aria-label="Modifica intervento"
                />

                <DetailHeaderAction
                    icon={Printer}
                    text="Stampa"
                    onClick={handlePrintIntervention}
                    aria-label="Stampa intervento"
                />

                <DetailHeaderAction
                    variant="outline"
                    // La busta, come il pulsante email nella lista interventi e la sezione Email delle
                    // Impostazioni: prima qui c'era l'aeroplanino (`Send`), e la stessa azione aveva
                    // due icone diverse fra lista e scheda.
                    icon={Mail}
                    text="Email"
                    onClick={() => emailAction.open(intervention.id)}
                    aria-label="Invia email intervento"
                />

                <DetailDeleteButton
                    label="Elimina intervento"
                    title="Elimina intervento"
                    description={`Sei sicuro di voler eliminare l'intervento ID ${intervention.id}?`}
                    onDelete={() => deleteIntervention(intervention.id)}
                    successMessage="Intervento eliminato con successo"
                    errorMessage="Impossibile eliminare l'intervento"
                    redirectTo="/interventions"
                />
            </DetailHeader>

            {/* Attenuato durante un ricaricamento: vedi lo stesso blocco in `ReportPage`. */}
            <div
                aria-busy={isReloading}
                className={cn("flex flex-col gap-4", isReloading && "opacity-60 transition-opacity")}
            >
                {/* Sotto `xl` una riga per voce, con il valore a destra: "In lavorazione" o
                "Intervento da remoto" non escono più dal bordo di una mezza card. */}
                <DetailStats
                    mobileTitle={pageTitle}
                    items={[
                        {
                            label: "Stato",
                            value: (
                                <DetailStatBadge color={interventionStatusColor[intervention.status]}>
                                    {formatInterventionStatus(intervention.status)}
                                </DetailStatBadge>
                            ),
                        },
                        { label: "Tipo intervento", value: formatInterventionType(intervention.type) },
                        { label: "Data intervento", value: formatDate(intervention.interventionDate) },
                        {
                            label: "Ora inizio",
                            value: isAssistance ? formatInterventionTime(intervention.startTime) : "-",
                        },
                        { label: "Ora fine", value: isAssistance ? formatInterventionTime(intervention.endTime) : "-" },
                    ]}
                />

                <div className="grid gap-4 xl:grid-cols-2">
                    <DetailSection title="Anagrafica" className="self-start">
                        {/* A righe come la scheda report: etichetta a sinistra, valore a destra. */}
                        <DetailGrid layout="rows">
                            <DetailItem label="Cliente" value={intervention.customerName ?? "Cliente sconosciuto"} />
                            <DetailItem label="Telefono" value={intervention.customerPhone ?? "-"} />
                            <DetailItem
                                label="Collaboratore"
                                value={intervention.collaboratorName ?? "Collaboratore sconosciuto"}
                            />
                        </DetailGrid>
                    </DetailSection>

                    {/* A righe come la scheda report; i testi liberi (problema, descrizione, note) su
                    telefono vanno sotto l'etichetta (`longText`). */}
                    <DetailSection title="Dettagli">
                        <DetailGrid layout="rows">
                            {isAssistance ? (
                                <DetailItem label="Problema" value={intervention.problem ?? "-"} longText />
                            ) : null}
                            {/* Lo stesso nome del campo nel modulo ("Assistenza effettuata" o "Materiali
                            da consegnare"): "Descrizione" non diceva cosa ci fosse scritto. */}
                            <DetailItem
                                label={interventionDescriptionLabel(intervention.type)}
                                value={intervention.description ?? "-"}
                                longText
                            />
                            <DetailItem label="Note" value={intervention.note ?? "-"} longText />
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
                        </DetailGrid>
                    </DetailSection>
                </div>
            </div>

            <CustomDialog
                open={emailAction.isOpen}
                onOpenChange={emailAction.onOpenChange}
                title="Invia email intervento"
                description={`Sei sicuro di voler inviare l'email per l'intervento ID ${intervention.id}?`}
                confirmLabel="Invia"
                confirmIcon={Mail}
                cancelLabel="Annulla"
                confirmDisabled={emailAction.isRunning}
                onCancel={emailAction.close}
                onConfirm={emailAction.confirm}
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
