import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import EntityTable from "@/components/entity-table";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import OpenEntityButton from "@/components/open-entity-button";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TablePagination from "@/components/table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    getApiErrorMessage,
    getCustomer,
    getCustomerInterventionsPrintUrl,
    getCustomerReportsPrintUrl,
    listInterventions,
    listReports,
} from "@/lib/api";
import { interventionStatusColor, interventionStatusOptions } from "@/lib/interventions";
import { formatDateTime, openPrintWindow } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import type { CustomerDto, InterventionDto, ReportDto } from "@/types/dtos";
import type { ReportVisibilityFilter } from "../reports/components/types";
import type { InterventionStatusFilter } from "../interventions/components/types";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { customerInterventionColumns, customerReportColumns } from "./components/customer-detail-columns";

type CustomerTab = "reports" | "interventions";

const formatCustomerName = (customer: CustomerDto) => `${customer.firstName} ${customer.lastName ?? ""}`.trim();

/**
 * La scheda del cliente: i suoi dati, i suoi report e i suoi interventi.
 *
 * Ha la stessa forma della scheda del collaboratore — intestazione, due tab, `EntityTable`
 * con filtro a destra e impaginazione in fondo — più il riquadro con i dati di contatto, che
 * prima non c'era: per sapere il telefono del cliente di cui si stava guardando la scheda
 * bisognava tornare all'elenco clienti.
 *
 * Prima i report e gli interventi erano due pagine distinte, ciascuna con una tabella di tre
 * o quattro colonne, un'etichetta e un filtro rientrati di 48px rispetto al resto. Ora sono
 * due tab della stessa pagina, e l'indirizzo segue il tab: `/clients/:id` apre i report,
 * `/clients/:id/interventions` gli interventi. Così i due pulsanti dell'elenco clienti e i
 * collegamenti già salvati continuano a portare dove portavano, e ricaricare la pagina non fa
 * perdere il tab.
 *
 * Filtro e impaginazione sono del server: l'elenco completo senza paginazione si ferma a 5000
 * righe, e sul database di sviluppo un cliente con cinque report risultava non averne.
 */
const CustomerPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const customerId = Number(id);
    const activeTab: CustomerTab = location.pathname.endsWith("/interventions") ? "interventions" : "reports";

    const [isCustomerLoading, setIsCustomerLoading] = useState(true);
    const [customer, setCustomer] = useState<CustomerDto | null>(null);
    const customerName = customer ? formatCustomerName(customer) : "Cliente";
    useDocumentTitle(activeTab === "interventions" ? `Interventi di ${customerName}` : customerName);

    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("all");
    const [interventionStatusFilter, setInterventionStatusFilter] = useState<InterventionStatusFilter>("all");
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

    const hasValidCustomerId = useMemo(() => Number.isInteger(customerId) && customerId > 0, [customerId]);

    const handleBack = () => {
        navigate(-1);
    };

    const handleTabChange = (value: string) => {
        navigate(value === "interventions" ? `/clients/${customerId}/interventions` : `/clients/${customerId}`, {
            replace: true,
        });
    };

    // La stampa segue il tab: dal tab dei report stampa il resoconto dei report, dall'altro
    // quello degli interventi. Prima ognuna delle due pagine aveva il suo pulsante.
    const printTitle = activeTab === "interventions" ? "Stampa resoconto interventi" : "Stampa resoconto report";

    const handleConfirmPrint = (range: { dateFrom?: string; dateTo?: string }) => {
        openPrintWindow(
            activeTab === "interventions"
                ? getCustomerInterventionsPrintUrl(customerId, range)
                : getCustomerReportsPrintUrl(customerId, range)
        );
    };

    const handleOpenReport = (reportId: number) => {
        navigate(`/reports/${reportId}`);
    };

    const handleOpenIntervention = (interventionId: number) => {
        navigate(`/interventions/${interventionId}`);
    };

    // Come nella scheda collaboratore: le due liste si impaginano per conto proprio.
    const [reportsPageSize, setReportsPageSize] = useTableRowsPerPage("customer-reports");
    const { currentPage: reportsPage, setCurrentPage: setReportsPage } = useTablePagination({
        resetDependencies: [visibilityFilter, reportsPageSize],
    });

    const [interventionsPageSize, setInterventionsPageSize] = useTableRowsPerPage("customer-interventions");
    const { currentPage: interventionsPage, setCurrentPage: setInterventionsPage } = useTablePagination({
        resetDependencies: [interventionStatusFilter, interventionsPageSize],
    });

    const {
        rows: reportRows,
        totalItems: reportsTotalItems,
        totalPages: reportsTotalPages,
        isInitialLoading: areReportsInitialLoading,
        isRefetching: areReportsRefetching,
        isLoading: areReportsLoading,
        reload: reloadReports,
    } = usePaginatedRows<ReportDto>({
        fetchRows: (signal) =>
            listReports({
                page: reportsPage,
                pageSize: reportsPageSize,
                visibility: visibilityFilter,
                customerId,
                signal,
            }),
        queryKey: [customerId, reportsPage, reportsPageSize, visibilityFilter],
        errorMessage: "Impossibile caricare i report del cliente",
        initialLoading: false,
    });

    const {
        rows: interventionRows,
        totalItems: interventionsTotalItems,
        totalPages: interventionsTotalPages,
        isInitialLoading: areInterventionsInitialLoading,
        isRefetching: areInterventionsRefetching,
        isLoading: areInterventionsLoading,
        reload: reloadInterventions,
    } = usePaginatedRows<InterventionDto>({
        fetchRows: (signal) =>
            listInterventions({
                page: interventionsPage,
                pageSize: interventionsPageSize,
                status: interventionStatusFilter,
                customerId,
                signal,
            }),
        queryKey: [customerId, interventionsPage, interventionsPageSize, interventionStatusFilter],
        errorMessage: "Impossibile caricare gli interventi del cliente",
        initialLoading: false,
    });

    const loadCustomer = useCallback(async () => {
        try {
            setCustomer(await getCustomer(customerId));
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare il cliente"));
        }
    }, [customerId]);

    const handleRefresh = useCallback(async () => {
        await Promise.all([loadCustomer(), reloadReports(), reloadInterventions()]);
    }, [loadCustomer, reloadInterventions, reloadReports]);

    useEffect(() => {
        if (!hasValidCustomerId) {
            toast.error("Cliente non valido");
            navigate("/clients");
        }
    }, [hasValidCustomerId, navigate]);

    // Separato dall'effetto qui sopra perché `navigate` cambia identità a ogni cambio di
    // indirizzo, e cambiare tab cambia l'indirizzo: con `navigate` fra le dipendenze, ogni
    // cambio di tab ricaricava il cliente e copriva la pagina con lo spinner per un istante.
    useEffect(() => {
        if (!hasValidCustomerId) {
            return;
        }

        // I dati del cliente sono l'intestazione e il riquadro in alto: è l'unica cosa che si
        // aspetta prima di disegnare la pagina. Le liste si caricano da sole, con lo scheletro.
        void (async () => {
            setIsCustomerLoading(true);
            try {
                await loadCustomer();
            } finally {
                setIsCustomerLoading(false);
            }
        })();
    }, [hasValidCustomerId, loadCustomer]);

    if (isCustomerLoading) {
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

            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                            <ArrowLeft className="size-6" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Torna indietro</TooltipContent>
                </Tooltip>
                <h1 className="min-w-0 text-2xl font-bold wrap-break-word">{customerName}</h1>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <RefreshButton
                        onRefresh={handleRefresh}
                        isRefreshing={areReportsLoading || areInterventionsLoading}
                        label="Aggiorna i dati del cliente"
                    />

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="lg" onClick={() => setIsPrintDialogOpen(true)} aria-label={printTitle}>
                                <Printer className="size-5" />
                                <span className="hidden text-lg lg:inline">Stampa</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{printTitle}</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {customer ? (
                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Dati del cliente</CardTitle>
                    </CardHeader>
                    {/* Due colonne anche su mobile: una voce per riga, la scheda occupava metà
                        schermo e alla tabella restava lo spazio di una riga. L'email, che può
                        essere lunga, prende la riga intera finché le colonne sono due. */}
                    <CardContent className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                        <DetailItem label="Telefono" value={customer.phoneNumber ?? "-"} />
                        <DetailItem label="Telefono 2" value={customer.phoneNumberSecondary ?? "-"} />
                        <DetailItem label="Email" value={customer.email ?? "-"} className="col-span-2 xl:col-span-1" />
                        <DetailItem label="Località" value={customer.city ?? "-"} />
                        <DetailItem label="Cliente dal" value={formatDateTime(customer.createdAt)} />
                    </CardContent>
                </Card>
            ) : null}

            <Tabs value={activeTab} onValueChange={handleTabChange} className="min-h-0 flex-1">
                <TabsList>
                    <TabsTrigger value="reports">Report</TabsTrigger>
                    <TabsTrigger value="interventions">Interventi</TabsTrigger>
                </TabsList>

                <TabsContent value="reports" aria-label="Report del cliente" className="min-h-0 flex-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <Select
                            value={visibilityFilter}
                            onValueChange={(value) => setVisibilityFilter(value as ReportVisibilityFilter)}
                        >
                            <SelectTrigger className="w-full sm:w-56" aria-label="Filtra i report per stato">
                                <SelectValue placeholder="Filtra per stato" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                <SelectItem value="all">Tutti i report</SelectItem>
                                <SelectItem value="open">Report aperti</SelectItem>
                                <SelectItem value="closed">Report chiusi</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Come nelle altre liste: l'area della tabella scorre da sola e
                        l'impaginazione resta ferma in fondo. */}
                    <div className="min-h-0 flex-1 overflow-auto">
                        <EntityTable
                            tableKey="customer-reports"
                            columns={customerReportColumns}
                            rows={reportRows}
                            getRowKey={(row) => row.id}
                            emptyMessage="Nessun report associato a questo cliente."
                            renderRowActions={(row) => (
                                <OpenEntityButton
                                    size="icon-lg"
                                    onClick={() => handleOpenReport(row.id)}
                                    aria-label={`Apri report ${row.id}`}
                                />
                            )}
                            getRowStatusColor={(row) => (row.closed ? "green" : "red")}
                            onRowOpen={(row) => handleOpenReport(row.id)}
                            isInitialLoading={areReportsInitialLoading}
                            isRefetching={areReportsRefetching}
                            skeletonRowCount={reportsPageSize}
                        />
                    </div>

                    <TablePagination
                        currentPage={reportsPage}
                        totalPages={reportsTotalPages}
                        totalItems={reportsTotalItems}
                        pageSize={reportsPageSize}
                        onPageChange={setReportsPage}
                        onPageSizeChange={setReportsPageSize}
                    />
                </TabsContent>

                <TabsContent value="interventions" aria-label="Interventi del cliente" className="min-h-0 flex-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <Select
                            value={interventionStatusFilter}
                            onValueChange={(value) => setInterventionStatusFilter(value as InterventionStatusFilter)}
                        >
                            <SelectTrigger className="w-full sm:w-56" aria-label="Filtra gli interventi per stato">
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

                    <div className="min-h-0 flex-1 overflow-auto">
                        <EntityTable
                            tableKey="customer-interventions"
                            columns={customerInterventionColumns}
                            rows={interventionRows}
                            getRowKey={(row) => row.id}
                            emptyMessage="Nessun intervento associato a questo cliente."
                            renderRowActions={(row) => (
                                <OpenEntityButton
                                    size="icon-lg"
                                    onClick={() => handleOpenIntervention(row.id)}
                                    aria-label={`Apri intervento ${row.id}`}
                                />
                            )}
                            getRowStatusColor={(row) => interventionStatusColor[row.status]}
                            onRowOpen={(row) => handleOpenIntervention(row.id)}
                            isInitialLoading={areInterventionsInitialLoading}
                            isRefetching={areInterventionsRefetching}
                            skeletonRowCount={interventionsPageSize}
                        />
                    </div>

                    <TablePagination
                        currentPage={interventionsPage}
                        totalPages={interventionsTotalPages}
                        totalItems={interventionsTotalItems}
                        pageSize={interventionsPageSize}
                        onPageChange={setInterventionsPage}
                        onPageSizeChange={setInterventionsPageSize}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default CustomerPage;
