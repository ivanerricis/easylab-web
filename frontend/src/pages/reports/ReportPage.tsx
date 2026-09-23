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
import EditReportDialog, { type EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import { toReportUpdatePayload } from "@/lib/reportForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReport, getReportPrintUrl, updateReport, deleteReport } from "@/lib/api";
import { formatDateTime, formatEuro, formatYesNo, openPrintWindow } from "@/lib/utils";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import StatusBadge from "@/components/status-badge";
import { formatReportStatus, paymentMethodLabels, reportStatusColor } from "@/lib/reports";

const TableHeaderCell = ({ children }: { children: string }) => (
    <th className="border border-border/70 bg-muted/40 px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {children}
    </th>
);

const TableCell = ({ children, alignRight = false }: { children: string; alignRight?: boolean }) => (
    <td className={`border border-border/70 px-3 py-2 text-sm ${alignRight ? "text-right font-semibold" : ""}`}>
        {children}
    </td>
);

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
                                    Report #{report.id} -{" "}
                                    {/* Il nome in alto è il primo che si guarda: è lui a portare al
                                        cliente, e l'anagrafica sotto resta testo per non ripeterlo. */}
                                    <CustomerLink
                                        customerId={report.customerId}
                                        name={report.customerName ?? "Cliente sconosciuto"}
                                    />
                                </h1>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
                            <RefreshButton onRefresh={reload} label="Aggiorna report" />

                            <TableActionButton
                                variant="outline"
                                size={"lg"}
                                onClick={() => setIsEditDialogOpen(true)}
                                aria-label="Modifica report"
                            >
                                <Pencil className="size-5" />
                                <span className="hidden text-lg lg:inline">Modifica</span>
                            </TableActionButton>

                            <TableActionButton size={"lg"} onClick={handlePrintReport} aria-label="Stampa report">
                                <Printer className="size-5" />
                                <span className="hidden text-lg lg:inline">Stampa</span>
                            </TableActionButton>

                            <DetailDeleteButton
                                label="Elimina report"
                                title="Elimina report"
                                description={`Sei sicuro di voler eliminare il report ID ${report.id}?`}
                                onDelete={() => deleteReport(report.id)}
                                successMessage="Report eliminato con successo"
                                errorMessage="Impossibile eliminare il report"
                                redirectTo="/reports"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/*
                Due per riga sotto xl invece di una: su mobile le cinque card impilate occupavano
                circa 650px prima di arrivare ai dati. Il pagamento, ultimo e dispari, prende la
                riga intera.
            */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Stato</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatusBadge size="lg" color={reportStatusColor(report.closed)}>
                            {formatReportStatus(report.closed)}
                        </StatusBadge>
                    </CardContent>
                </Card>

                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Prezzo interno</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatEuro(report.price)}</p>
                    </CardContent>
                </Card>

                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Prezzo tecnici</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatEuro(report.technicianPrice)}</p>
                    </CardContent>
                </Card>

                <Card className="gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Totale</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatEuro(report.totalPrice)}</p>
                    </CardContent>
                </Card>

                <Card className="col-span-2 gap-2! border-primary/20 xl:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Pagamento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{paymentMethodLabels[report.paymentMethod]}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Anagrafica</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                        <DetailItem label="Cliente" value={report.customerName ?? "Cliente sconosciuto"} />
                        <DetailItem label="Telefono" value={report.customerPhone ?? "-"} />
                        <DetailItem label="Collaboratore" value={report.collaboratorName ?? "-"} />
                        <DetailItem label="Dispositivo" value={report.deviceName} />
                        <DetailItem label="Difetto catalogo" value={report.issueName} />
                    </CardContent>
                </Card>

                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Stato e gestione</CardTitle>
                    </CardHeader>
                    {/*
                        Stato (aperto/chiuso) e metodo di pagamento non si ripetono qui: stanno già
                        nelle card in alto. C'è invece "Avvisato", che si imposta dal dialogo di
                        modifica ma in questa pagina non compariva da nessuna parte.
                    */}
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                        <DetailItem label="Alimentatore" value={formatYesNo(report.charger)} />
                        <DetailItem label="Backup dati" value={formatYesNo(report.dataBackup)} />
                        <DetailItem label="Avvisato" value={formatYesNo(report.alerted)} />
                        <DetailItem label="Creato il" value={formatDateTime(report.created_at)} />
                        <DetailItem
                            label="Ultimo aggiornamento"
                            value={report.updated_at ? formatDateTime(report.updated_at) : "-"}
                        />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Dettagli intervento</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <DetailItem label="Problema riscontrato" value={report.issueDescription ?? "-"} />
                        <DetailItem label="Descrizione intervento" value={report.serviceDescription ?? "-"} />
                        <DetailItem label="Password" value={report.password ?? "-"} />
                        <DetailItem label="Note" value={report.note ?? "-"} />
                    </CardContent>
                </Card>

                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Tecnici associati</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!hasTechnician ? (
                            <p className="text-muted-foreground">Nessun tecnico associato a questo report.</p>
                        ) : (
                            <div className="overflow-hidden rounded-md border border-border/70">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr>
                                            <TableHeaderCell>Tecnico</TableHeaderCell>
                                            <TableHeaderCell>Prezzo</TableHeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="odd:bg-muted/20">
                                            <TableCell>{technicianName}</TableCell>
                                            <TableCell alignRight>{formatEuro(report.technicianPrice)}</TableCell>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
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
