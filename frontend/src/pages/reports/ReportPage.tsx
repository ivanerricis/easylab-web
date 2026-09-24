import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem, { DetailGrid, DetailSection } from "@/components/detail-item";
import { DetailHeader, DetailHeaderAction } from "@/components/detail-header";
import DetailStats, { DetailStatBadge } from "@/components/detail-stats";
import CustomerLink from "@/components/customer-link";
import LoadingPage from "@/components/loadingPage";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import RefreshButton from "@/components/refresh-button";
import DetailDeleteButton from "@/components/detail-delete-button";
import EditReportDialog, { type EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import { toReportUpdatePayload } from "@/lib/reportForm";
import { getReport, getReportPrintUrl, updateReport, deleteReport } from "@/lib/api";
import { formatDateTime, formatEuro, formatYesNo, openPrintWindow } from "@/lib/utils";
import { Pencil, Printer } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { formatReportStatus, paymentMethodLabels, reportStatusColor } from "@/lib/reports";

const ReportPage = () => {
    const { id } = useParams();
    // Una richiesta sola: il report arriva con il totale già calcolato e i nomi di cliente,
    // dispositivo, difetto, collaboratore e tecnico. `useEntityDetail` tiene id, 404 e
    // ritorno all'elenco su altri errori — vedi il suo commento per il perché.
    const {
        data: report,
        isLoading,
        isNotFound,
        reload,
    } = useEntityDetail(id, getReport, {
        backTo: "/reports",
        errorMessage: "Impossibile caricare il report",
    });
    useDocumentTitle(report ? `Report #${report.id} - ${report.customerName ?? "Cliente sconosciuto"}` : "Report");
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const handleBack = useGoBack("/reports");

    const handlePrintReport = () => {
        if (!report) {
            return;
        }

        openPrintWindow(getReportPrintUrl(report.id));
    };

    const handleEditReport = async (values: EditReportSubmitValues) => {
        await updateReport(values.reportId, toReportUpdatePayload(values));

        await reload();
    };

    if (isNotFound) {
        return (
            <NotFoundState
                title="Report non trovato"
                description="Il report che cerchi non esiste, oppure è stato eliminato."
                backTo="/reports"
                backLabel="Vai ai report"
            />
        );
    }

    if (isLoading) {
        return <LoadingPage />;
    }

    if (!report) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">Report non disponibile.</div>
        );
    }

    // Un solo tecnico esterno per report, non più un elenco: vedi il commento sul contratto
    // `GET /reports/:id` in `lib/api/reports.ts`. Il totale arriva già calcolato dal server
    // (prezzo interno più compenso tecnico), con la stessa espressione di `listReports`.
    const hasTechnician = report.technicianId != null;
    const technicianName = report.technicianName ?? `Tecnico #${report.technicianId}`;

    return (
        // Niente più `overflow-auto` e `p-2` propri: scorre il `main` del layout, come nelle altre
        // schede. Il padding in più spostava freccia e titolo rispetto a cliente e collaboratore,
        // e su un telefono le barre di scorrimento erano due, una dentro l'altra. `self-start`
        // perché il `main` è un flex a riga: tirata all'altezza dello schermo, la colonna
        // schiacciava le card per farcele stare, invece di allungarsi e lasciar scorrere il `main`.
        <div className="flex w-full flex-col gap-4 self-start">
            <DetailHeader
                onBack={handleBack}
                title={
                    <>
                        Report #{report.id} -{" "}
                        {/* Il nome in alto è il primo che si guarda: è lui a portare al
                            cliente, e l'anagrafica sotto resta testo per non ripeterlo. */}
                        <CustomerLink
                            customerId={report.customerId}
                            name={report.customerName ?? "Cliente sconosciuto"}
                        />
                    </>
                }
            >
                <RefreshButton onRefresh={reload} label="Aggiorna report" />

                <DetailHeaderAction
                    variant="outline"
                    icon={Pencil}
                    text="Modifica"
                    onClick={() => setIsEditDialogOpen(true)}
                    aria-label="Modifica report"
                />

                <DetailHeaderAction
                    icon={Printer}
                    text="Stampa"
                    onClick={handlePrintReport}
                    aria-label="Stampa report"
                />

                <DetailDeleteButton
                    label="Elimina report"
                    title="Elimina report"
                    description={`Sei sicuro di voler eliminare il report ID ${report.id}?`}
                    onDelete={() => deleteReport(report.id)}
                    successMessage="Report eliminato con successo"
                    errorMessage="Impossibile eliminare il report"
                    redirectTo="/reports"
                />
            </DetailHeader>

            <DetailStats
                items={[
                    {
                        label: "Stato",
                        value: (
                            <DetailStatBadge color={reportStatusColor(report.closed)}>
                                {formatReportStatus(report.closed)}
                            </DetailStatBadge>
                        ),
                    },
                    { label: "Prezzo interno", value: formatEuro(report.price) },
                    { label: "Prezzo tecnici", value: formatEuro(report.technicianPrice) },
                    { label: "Totale", value: formatEuro(report.totalPrice) },
                    { label: "Pagamento", value: paymentMethodLabels[report.paymentMethod] },
                ]}
            />

            <div className="grid gap-4 xl:grid-cols-2">
                <DetailSection title="Anagrafica">
                    <DetailGrid className="grid-cols-2">
                        <DetailItem label="Cliente" value={report.customerName ?? "Cliente sconosciuto"} />
                        <DetailItem label="Telefono" value={report.customerPhone ?? "-"} />
                        <DetailItem label="Collaboratore" value={report.collaboratorName ?? "-"} />
                        <DetailItem label="Dispositivo" value={report.deviceName} />
                        <DetailItem label="Difetto catalogo" value={report.issueName} className="col-span-2" />
                    </DetailGrid>
                </DetailSection>

                {/*
                    Stato (aperto/chiuso) e metodo di pagamento non si ripetono qui: stanno già
                    nei numeri in alto. C'è invece "Avvisato", che si imposta dal dialogo di
                    modifica ma in questa pagina non compariva da nessuna parte.
                */}
                <DetailSection title="Stato e gestione">
                    <DetailGrid className="grid-cols-2 sm:grid-cols-3">
                        <DetailItem label="Alimentatore" value={formatYesNo(report.charger)} />
                        <DetailItem label="Backup dati" value={formatYesNo(report.dataBackup)} />
                        <DetailItem label="Avvisato" value={formatYesNo(report.alerted)} />
                        <DetailItem label="Creato il" value={formatDateTime(report.created_at)} />
                        <DetailItem
                            label="Ultimo aggiornamento"
                            value={report.updated_at ? formatDateTime(report.updated_at) : "-"}
                        />
                    </DetailGrid>
                </DetailSection>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <DetailSection title="Dettagli intervento">
                    <DetailGrid>
                        <DetailItem label="Problema riscontrato" value={report.issueDescription ?? "-"} />
                        <DetailItem label="Descrizione intervento" value={report.serviceDescription ?? "-"} />
                        <DetailItem label="Password" value={report.password ?? "-"} />
                        <DetailItem label="Note" value={report.note ?? "-"} />
                    </DetailGrid>
                </DetailSection>

                {/* Un tecnico solo per report: prima era una tabella bordata di una riga dentro la
                    card, un'altra scatola; ora due voci come il resto della scheda. */}
                <DetailSection title="Tecnici associati" className="self-start">
                    {!hasTechnician ? (
                        <p className="text-muted-foreground">Nessun tecnico associato a questo report.</p>
                    ) : (
                        <DetailGrid className="grid-cols-2">
                            <DetailItem label="Tecnico" value={technicianName} />
                            <DetailItem label="Prezzo" value={formatEuro(report.technicianPrice)} />
                        </DetailGrid>
                    )}
                </DetailSection>
            </div>

            <EditReportDialog
                open={isEditDialogOpen}
                reportId={report.id}
                customerName={report.customerName ?? "Cliente sconosciuto"}
                onOpenChange={setIsEditDialogOpen}
                onSubmit={handleEditReport}
            />
        </div>
    );
};

export default ReportPage;
