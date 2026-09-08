import EntityCardList from "@/components/entity-card-list";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import OpenEntityButton from "@/components/open-entity-button";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TablePagination from "@/components/table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiErrorMessage, getCustomerInterventionsPrintUrl, listCustomers, listInterventions } from "@/lib/api";
import { openPrintWindow } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import {
    formatInterventionStatus,
    formatInterventionTime,
    formatInterventionType,
    interventionStatusOptions,
} from "@/lib/interventions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import type { InterventionStatus } from "@/types/dtos";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

type InterventionStatusFilter = "all" | InterventionStatus;

type CustomerInterventionRow = {
    id: number;
    type: string;
    schedule: string;
    status: InterventionStatus;
};

const accentClassNameByStatus: Record<InterventionStatus, string> = {
    programmato: "border-t-red-500",
    in_lavorazione: "border-t-yellow-400",
    completato: "border-t-green-500",
};

const statusColorByStatus: Record<InterventionStatus, string> = {
    programmato: "red",
    in_lavorazione: "yellow",
    completato: "green",
};

const formatSchedule = (interventionDate: string | null, startTime: string | null, endTime: string | null) => {
    if (!interventionDate) {
        return "-";
    }

    if (!startTime || !endTime) {
        return formatDate(interventionDate);
    }

    return `${formatDate(interventionDate)} ${formatInterventionTime(startTime)}-${formatInterventionTime(endTime)}`;
};

const CustomerInterventionsPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const customerId = Number(id);
    const [isLoading, setIsLoading] = useState(true);
    const [customerName, setCustomerName] = useState("Cliente");
    const [interventionRows, setInterventionRows] = useState<CustomerInterventionRow[]>([]);
    const [statusFilter, setStatusFilter] = useState<InterventionStatusFilter>("all");
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

    const hasValidCustomerId = useMemo(() => Number.isInteger(customerId) && customerId > 0, [customerId]);

    const handleBack = () => {
        navigate(-1);
    };

    const handleConfirmPrint = (range: { dateFrom?: string; dateTo?: string }) => {
        openPrintWindow(getCustomerInterventionsPrintUrl(customerId, range));
    };

    const visibleInterventionRows = useMemo(() => {
        if (statusFilter === "all") {
            return interventionRows;
        }

        return interventionRows.filter((intervention) => intervention.status === statusFilter);
    }, [interventionRows, statusFilter]);

    const [pageSize, setPageSize] = useTableRowsPerPage("customer-interventions");
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [statusFilter, pageSize],
    });
    const totalItems = visibleInterventionRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const paginatedInterventionRows = visibleInterventionRows.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const loadData = useCallback(async () => {
        try {
            const [interventions, customers] = await Promise.all([listInterventions(), listCustomers()]);

            const customer = customers.find((item) => item.id === customerId);
            if (customer) {
                setCustomerName(`${customer.firstName} ${customer.lastName ?? ""}`.trim());
            }

            const rows = interventions
                .filter((intervention) => intervention.customerId === customerId)
                .map((intervention) => ({
                    id: intervention.id,
                    type: formatInterventionType(intervention.type),
                    schedule: formatSchedule(
                        intervention.interventionDate,
                        intervention.startTime,
                        intervention.endTime
                    ),
                    status: intervention.status,
                }));

            setInterventionRows(rows);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare gli interventi del cliente"));
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
                title="Stampa resoconto interventi"
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
                    <RefreshButton onRefresh={loadData} label="Aggiorna interventi del cliente" />

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="lg"
                                onClick={() => setIsPrintDialogOpen(true)}
                                aria-label="Stampa resoconto interventi"
                            >
                                <Printer className="size-5" />
                                <Label className="hidden text-lg lg:inline">Stampa</Label>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Stampa resoconto interventi</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <p className="ml-12">Interventi del cliente</p>
            <div className="ml-12">
                <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as InterventionStatusFilter)}
                >
                    <SelectTrigger className="w-full sm:w-56">
                        <SelectValue placeholder="Filtra per stato" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                        <SelectItem value="all">Tutti gli interventi</SelectItem>
                        {interventionStatusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <Table className="hidden bg-background sm:table">
                        <TableHeader className="w-full">
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Data/Orario</TableHead>
                                <TableHead>Stato</TableHead>
                                <TableHead className="text-right">Azioni</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedInterventionRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                                        Nessun intervento associato a questo cliente.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedInterventionRows.map((intervention) => (
                                    <TableRow
                                        key={intervention.id}
                                        data-status-color={statusColorByStatus[intervention.status]}
                                    >
                                        <TableCell>{intervention.id}</TableCell>
                                        <TableCell>{intervention.type}</TableCell>
                                        <TableCell>{intervention.schedule}</TableCell>
                                        <TableCell>{formatInterventionStatus(intervention.status)}</TableCell>
                                        <TableCell className="bg-background text-right text-foreground">
                                            <div className="flex items-center justify-end gap-2">
                                                <OpenEntityButton
                                                    size="icon-lg"
                                                    onClick={() => navigate(`/interventions/${intervention.id}`)}
                                                    aria-label={`Apri intervento ${intervention.id}`}
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
                            { key: "id", header: "ID", render: (row: CustomerInterventionRow) => row.id },
                            { key: "type", header: "Tipo", render: (row: CustomerInterventionRow) => row.type },
                            {
                                key: "schedule",
                                header: "Data/Orario",
                                render: (row: CustomerInterventionRow) => row.schedule,
                            },
                            {
                                key: "status",
                                header: "Stato",
                                render: (row: CustomerInterventionRow) => formatInterventionStatus(row.status),
                            },
                        ]}
                        rows={paginatedInterventionRows}
                        getRowKey={(row) => row.id}
                        getAccentClassName={(row) => accentClassNameByStatus[row.status]}
                        renderActions={(row) => (
                            <OpenEntityButton
                                size="icon-lg"
                                onClick={() => navigate(`/interventions/${row.id}`)}
                                aria-label={`Apri intervento ${row.id}`}
                            />
                        )}
                        emptyMessage="Nessun intervento associato a questo cliente."
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

export default CustomerInterventionsPage;
