import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import EditReportDialog, { type EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    createReportTechnician,
    deleteReportTechnician,
    getApiErrorMessage,
    getReport,
    getReportPrintUrl,
    listCollaborators,
    listCustomers,
    listDevices,
    listIssues,
    listReportTechnicians,
    listTechnicians,
    type ReportEntityDto,
    updateReport,
    updateReportTechnician,
} from "@/lib/api";
import { formatDateTime, formatEuro, openPrintWindow } from "@/lib/utils";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

type ReportPageDetails = {
    report: ReportEntityDto;
    customerName: string;
    customerPhone: string | null;
    deviceName: string;
    issueName: string;
    collaboratorName: string;
    technicians: Array<{ id: number; name: string; price: number }>;
    techniciansTotal: number;
};

const yesNo = (value: boolean) => (value ? "Si" : "No");

const paymentMethodLabel = (value: ReportEntityDto["paymentMethod"]) => {
    if (value === "cash") {
        return "Contanti";
    }

    if (value === "card") {
        return "Carta";
    }

    return "Non pagato";
};

const statusBadgeClass = (value: boolean) =>
    value
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";

const DetailItem = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-sm font-medium wrap-break-word">{value}</p>
    </div>
);

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
    const navigate = useNavigate();
    const { id } = useParams();
    const reportId = Number(id);
    const [isLoading, setIsLoading] = useState(true);
    const [details, setDetails] = useState<ReportPageDetails | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const hasValidReportId = useMemo(() => Number.isInteger(reportId) && reportId > 0, [reportId]);

    const handleBack = () => {
        navigate(-1);
    };

    const handlePrintReport = () => {
        if (!details) {
            return;
        }

        openPrintWindow(getReportPrintUrl(details.report.id));
    };

    const loadDetails = useCallback(async () => {
        const [report, customers, devices, issues, collaborators, reportTechnicians, technicians] = await Promise.all([
            getReport(reportId),
            listCustomers(),
            listDevices(),
            listIssues(),
            listCollaborators(),
            listReportTechnicians(),
            listTechnicians(),
        ]);

        const customer = customers.find((item) => item.id === report.customerId);
        const device = devices.find((item) => item.id === report.deviceId);
        const issue = issues.find((item) => item.id === report.issueId);
        const collaborator = collaborators.find((item) => item.id === report.collaboratorId);

        const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
        const reportTechnicianRows = reportTechnicians.filter((item) => item.reportId === report.id);

        const technicianDetails = reportTechnicianRows.map((item) => {
            const technician = technicianById.get(item.technicianId);
            return {
                id: item.technicianId,
                name: technician
                    ? `${technician.firstName} ${technician.lastName ?? ""}`.trim()
                    : `Tecnico #${item.technicianId}`,
                price: item.price,
            };
        });

        const techniciansTotal = technicianDetails.reduce((total, item) => total + item.price, 0);

        setDetails({
            report,
            customerName: customer ? `${customer.firstName} ${customer.lastName ?? ""}`.trim() : "Cliente sconosciuto",
            customerPhone: customer?.phoneNumber ?? customer?.phoneNumberSecondary ?? null,
            deviceName: device?.name ?? "Dispositivo sconosciuto",
            issueName: issue?.description ?? "Difetto sconosciuto",
            collaboratorName: collaborator ? `${collaborator.firstName} ${collaborator.lastName ?? ""}`.trim() : "-",
            technicians: technicianDetails,
            techniciansTotal,
        });
    }, [reportId]);

    const handleRefreshReport = async () => {
        try {
            await loadDetails();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile aggiornare il report"));
        }
    };

    const handleEditReport = async (values: EditReportSubmitValues) => {
        await updateReport(values.reportId, {
            customerId: values.customerId,
            deviceId: values.deviceId,
            issueId: values.issueId,
            collaboratorId: values.collaboratorId,
            serviceDescription: values.serviceDescription,
            note: values.note,
            password: values.password,
            dataBackup: values.dataBackup,
            charger: values.charger,
            alerted: values.alerted,
            closed: values.closed,
            paymentMethod: values.paymentMethod,
            price: values.internalPrice,
        });

        if (values.technicianId != null) {
            if (values.existingTechnicianId == null) {
                await createReportTechnician({
                    reportId: values.reportId,
                    technicianId: values.technicianId,
                    price: values.technicianPrice,
                });
            } else if (values.existingTechnicianId === values.technicianId) {
                await updateReportTechnician(values.reportId, values.technicianId, values.technicianPrice);
            } else {
                await deleteReportTechnician(values.reportId, values.existingTechnicianId);
                await createReportTechnician({
                    reportId: values.reportId,
                    technicianId: values.technicianId,
                    price: values.technicianPrice,
                });
            }
        } else if (values.existingTechnicianId != null) {
            await deleteReportTechnician(values.reportId, values.existingTechnicianId);
        }

        await loadDetails();
    };

    useEffect(() => {
        if (!hasValidReportId) {
            toast.error("Report non valido");
            navigate("/reports");
            return;
        }

        const loadData = async () => {
            try {
                setIsLoading(true);
                await loadDetails();
            } catch (error) {
                toast.error(getApiErrorMessage(error, "Impossibile caricare il report"));
                navigate("/reports");
            } finally {
                setIsLoading(false);
            }
        };

        void loadData();
    }, [hasValidReportId, navigate, loadDetails]);

    if (isLoading) {
        return <LoadingPage />;
    }

    if (!details) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">Report non disponibile.</div>
        );
    }

    const totalPrice = details.report.price + details.techniciansTotal;

    return (
        <div className="flex w-full flex-col gap-4 overflow-auto p-2">
            <div className="border-primary/30">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        size={"icon-lg"}
                                        variant={"ghost"}
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
                                    Report #{details.report.id} - {details.customerName}
                                </h1>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
                            <RefreshButton onRefresh={handleRefreshReport} label="Aggiorna report" />

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size={"lg"}
                                        onClick={() => setIsEditDialogOpen(true)}
                                        aria-label="Modifica report"
                                    >
                                        <Pencil className="size-5" />
                                        <Label className="hidden text-lg lg:inline">Modifica</Label>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Modifica report</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size={"lg"} onClick={handlePrintReport} aria-label="Stampa report">
                                        <Printer className="size-5" />
                                        <Label className="hidden text-lg lg:inline">Stampa</Label>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Stampa report</TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Card className="h-fit! gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Stato</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <span
                            className={`inline-flex rounded-full px-3 py-1 text-2xl font-semibold ${statusBadgeClass(details.report.closed)}`}
                        >
                            {details.report.closed ? "Chiuso" : "Aperto"}
                        </span>
                    </CardContent>
                </Card>

                <Card className="h-fit! gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Prezzo interno</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatEuro(details.report.price)}</p>
                    </CardContent>
                </Card>

                <Card className="h-fit! gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Prezzo tecnici</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatEuro(details.techniciansTotal)}</p>
                    </CardContent>
                </Card>

                <Card className="h-fit! gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Totale</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{formatEuro(totalPrice)}</p>
                    </CardContent>
                </Card>

                <Card className="h-fit! gap-2! border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">Pagamento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{paymentMethodLabel(details.report.paymentMethod)}</p>
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
                        <DetailItem label="Dispositivo" value={details.deviceName} />
                        <DetailItem label="Difetto catalogo" value={details.issueName} />
                        <DetailItem label="Metodo pagamento" value={paymentMethodLabel(details.report.paymentMethod)} />
                    </CardContent>
                </Card>

                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Stato e gestione</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                        <DetailItem label="Chiuso" value={yesNo(details.report.closed)} />
                        <DetailItem label="Backup dati" value={yesNo(details.report.dataBackup)} />
                        <DetailItem label="Alimentatore" value={yesNo(details.report.charger)} />
                        <DetailItem label="Creato il" value={formatDateTime(details.report.created_at)} />
                        <DetailItem
                            label="Ultimo aggiornamento"
                            value={details.report.updated_at ? formatDateTime(details.report.updated_at) : "-"}
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
                        <DetailItem label="Descrizione problema" value={details.report.issueDescription ?? "-"} />
                        <DetailItem label="Descrizione servizio" value={details.report.serviceDescription ?? "-"} />
                        <DetailItem label="Password" value={details.report.password ?? "-"} />
                        <DetailItem label="Note" value={details.report.note ?? "-"} />
                    </CardContent>
                </Card>

                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Tecnici associati</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {details.technicians.length === 0 ? (
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
                                        {details.technicians.map((technician) => (
                                            <tr key={technician.id} className="odd:bg-muted/20">
                                                <TableCell>{technician.name}</TableCell>
                                                <TableCell alignRight>{formatEuro(technician.price)}</TableCell>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <EditReportDialog
                open={isEditDialogOpen}
                reportId={details.report.id}
                customerName={details.customerName}
                onOpenChange={setIsEditDialogOpen}
                onSubmit={handleEditReport}
            />
        </div>
    );
};

export default ReportPage;
