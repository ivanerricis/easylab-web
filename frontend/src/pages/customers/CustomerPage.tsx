import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import EntityCardList from "@/components/entity-card-list";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import OpenEntityButton from "@/components/open-entity-button";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TablePagination from "@/components/table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiErrorMessage, getCustomerReportsPrintUrl, listCustomers, listDevices, listReports } from "@/lib/api";
import { openPrintWindow } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import type { ReportVisibilityFilter } from "../reports/components/types";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

type CustomerReportRow = {
    id: number;
    deviceName: string;
    closed: boolean;
};

const getAccentClassName = (row: CustomerReportRow) => (row.closed ? "border-t-green-500" : "border-t-red-500");

const CustomerPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const customerId = Number(id);
    const [isLoading, setIsLoading] = useState(true);
    const [customerName, setCustomerName] = useState("Cliente");
    useDocumentTitle(customerName);
    const [reportRows, setReportRows] = useState<CustomerReportRow[]>([]);
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("all");
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

    const hasValidCustomerId = useMemo(() => Number.isInteger(customerId) && customerId > 0, [customerId]);

    const handleBack = () => {
        navigate(-1);
    };

    const handleConfirmPrint = (range: { dateFrom?: string; dateTo?: string }) => {
        openPrintWindow(getCustomerReportsPrintUrl(customerId, range));
    };

    const visibleReportRows = useMemo(() => {
        if (visibilityFilter === "open") {
            return reportRows.filter((report) => !report.closed);
        }

        if (visibilityFilter === "closed") {
            return reportRows.filter((report) => report.closed);
        }

        return reportRows;
    }, [reportRows, visibilityFilter]);

    const [pageSize, setPageSize] = useTableRowsPerPage("customer-reports");
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [visibilityFilter, pageSize],
    });
    const totalItems = visibleReportRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const paginatedReportRows = visibleReportRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const loadData = useCallback(async () => {
        try {
            const [reports, customers, devices] = await Promise.all([listReports(), listCustomers(), listDevices()]);

            const customer = customers.find((item) => item.id === customerId);
            if (customer) {
                setCustomerName(`${customer.firstName} ${customer.lastName ?? ""}`.trim());
            }

            const deviceById = new Map(devices.map((device) => [device.id, device]));

            const rows = reports
                .filter((report) => report.customerId === customerId)
                .map((report) => {
                    const device = deviceById.get(report.deviceId);

                    return {
                        id: report.id,
                        deviceName: device?.name ?? "Dispositivo sconosciuto",
                        closed: report.closed,
                    };
                });

            setReportRows(rows);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare i report del cliente"));
        }
    }, [customerId]);

    useEffect(() => {
        if (!hasValidCustomerId) {
            toast.error("Cliente non valido");
            navigate("/clients");
            return;
        }

        // Solo il primo caricamento copre la pagina con lo spinner: l'aggiornamento manuale
        // lascia i dati a schermo e segnala l'attesa nel pulsante.
        void (async () => {
            setIsLoading(true);
            try {
                await loadData();
            } finally {
                setIsLoading(false);
            }
        })();
    }, [hasValidCustomerId, navigate, loadData]);

    if (isLoading) {
        return <LoadingPage />;
    }

    return (
        <div className="flex h-full w-full flex-col gap-4">
            <PrintRangeDialog
                open={isPrintDialogOpen}
                onOpenChange={setIsPrintDialogOpen}
                title="Stampa resoconto report"
                onConfirm={handleConfirmPrint}
            />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                                <ArrowLeft className="size-6" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Torna indietro</TooltipContent>
                    </Tooltip>
                    <h1 className="text-2xl font-bold">{customerName}</h1>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-auto">
                    <RefreshButton onRefresh={loadData} label="Aggiorna report del cliente" />

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="lg"
                                onClick={() => setIsPrintDialogOpen(true)}
                                aria-label="Stampa resoconto report"
                            >
                                <Printer className="size-5" />
                                <span className="hidden text-lg lg:inline">Stampa</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Stampa resoconto report</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <p className="ml-12">Report del cliente</p>
            <div className="ml-12">
                <Select
                    value={visibilityFilter}
                    onValueChange={(value) => setVisibilityFilter(value as ReportVisibilityFilter)}
                >
                    <SelectTrigger className="w-full sm:w-56">
                        <SelectValue placeholder="Filtra per stato" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                        <SelectItem value="all">Tutti i report</SelectItem>
                        <SelectItem value="open">Report aperti</SelectItem>
                        <SelectItem value="closed">Report chiusi</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <Table className="hidden bg-background sm:table">
                        <TableHeader className="w-full">
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Dispositivo</TableHead>
                                <TableHead>Stato</TableHead>
                                <TableHead className="text-right">Azioni</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedReportRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                                        Nessun report associato a questo cliente.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedReportRows.map((report) => (
                                    <TableRow key={report.id} data-status-color={report.closed ? "green" : "red"}>
                                        <TableCell>Report #{report.id}</TableCell>
                                        <TableCell>{report.deviceName}</TableCell>
                                        <TableCell>{report.closed ? "Chiuso" : "Aperto"}</TableCell>
                                        <TableCell className="bg-background text-right text-foreground">
                                            <div className="flex items-center justify-end gap-2">
                                                <OpenEntityButton
                                                    size="icon-lg"
                                                    onClick={() => navigate(`/reports/${report.id}`)}
                                                    aria-label={`Apri report ${report.id}`}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    <EntityCardList
                        className="sm:hidden"
                        columns={[
                            { key: "id", header: "ID", render: (row: CustomerReportRow) => `Report #${row.id}` },
                            {
                                key: "deviceName",
                                header: "Dispositivo",
                                render: (row: CustomerReportRow) => row.deviceName,
                            },
                            {
                                key: "closed",
                                header: "Stato",
                                render: (row: CustomerReportRow) => (row.closed ? "Chiuso" : "Aperto"),
                            },
                        ]}
                        rows={paginatedReportRows}
                        getRowKey={(row) => row.id}
                        getAccentClassName={getAccentClassName}
                        renderActions={(row) => (
                            <OpenEntityButton
                                size="icon-lg"
                                onClick={() => navigate(`/reports/${row.id}`)}
                                aria-label={`Apri report ${row.id}`}
                            />
                        )}
                        emptyMessage="Nessun report associato a questo cliente."
                    />
                </div>
                <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </div>
        </div>
    );
};

export default CustomerPage;
