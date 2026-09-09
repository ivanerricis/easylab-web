import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import CardReport from "@/components/cardReport";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TablePagination from "@/components/table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiErrorMessage, listCollaborators, listCustomers, listDevices, listReports } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { ReportVisibilityFilter } from "../reports/components/types";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

type CollaboratorReportCard = {
    id: number;
    customerName: string;
    deviceName: string;
    closed: boolean;
};

const CollaboratorPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const collaboratorId = Number(id);
    const [isLoading, setIsLoading] = useState(true);
    const [collaboratorName, setCollaboratorName] = useState("Collaboratore");
    useDocumentTitle(collaboratorName);
    const [reportCards, setReportCards] = useState<CollaboratorReportCard[]>([]);
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("all");

    const hasValidCollaboratorId = useMemo(
        () => Number.isInteger(collaboratorId) && collaboratorId > 0,
        [collaboratorId]
    );

    const handleBack = () => {
        navigate(-1);
    };

    const visibleReportCards = useMemo(() => {
        if (visibilityFilter === "open") {
            return reportCards.filter((report) => !report.closed);
        }

        if (visibilityFilter === "closed") {
            return reportCards.filter((report) => report.closed);
        }

        return reportCards;
    }, [reportCards, visibilityFilter]);

    const [pageSize, setPageSize] = useTableRowsPerPage("collaborator-reports");
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [visibilityFilter, pageSize],
    });
    const totalItems = visibleReportCards.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const paginatedReportCards = visibleReportCards.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const loadData = useCallback(async () => {
        try {
            const [reports, collaborators, customers, devices] = await Promise.all([
                listReports(),
                listCollaborators(),
                listCustomers(),
                listDevices(),
            ]);

            const collaborator = collaborators.find((item) => item.id === collaboratorId);
            if (collaborator) {
                setCollaboratorName(`${collaborator.firstName} ${collaborator.lastName ?? ""}`.trim());
            }

            const customerById = new Map(customers.map((customer) => [customer.id, customer]));
            const deviceById = new Map(devices.map((device) => [device.id, device]));

            const cards = reports
                .filter((report) => report.collaboratorId === collaboratorId)
                .map((report) => {
                    const customer = customerById.get(report.customerId);
                    const device = deviceById.get(report.deviceId);

                    return {
                        id: report.id,
                        customerName: customer
                            ? `${customer.firstName} ${customer.lastName ?? ""}`.trim()
                            : "Cliente sconosciuto",
                        deviceName: device?.name ?? "Dispositivo sconosciuto",
                        closed: report.closed,
                    };
                });

            setReportCards(cards);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare i report del collaboratore"));
        }
    }, [collaboratorId]);

    useEffect(() => {
        if (!hasValidCollaboratorId) {
            toast.error("Collaboratore non valido");
            navigate("/collaborators");
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
    }, [hasValidCollaboratorId, navigate, loadData]);

    if (isLoading) {
        return <LoadingPage />;
    }

    return (
        <div className="flex h-full w-full flex-col gap-4">
            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                            <ArrowLeft className="size-6" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Torna indietro</TooltipContent>
                </Tooltip>
                <h1 className="text-2xl font-bold">{collaboratorName}</h1>
                <RefreshButton onRefresh={loadData} label="Aggiorna report del collaboratore" className="ml-auto" />
            </div>
            <p className="ml-12">Report del collaboratore</p>
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
            <div className="ml-12 flex flex-col gap-4">
                {visibleReportCards.length === 0 ? (
                    <p className="text-muted-foreground">Nessun report associato a questo collaboratore.</p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-6">
                            {paginatedReportCards.map((report) => (
                                <CardReport
                                    key={report.id}
                                    customerName={report.customerName}
                                    isClosed={report.closed}
                                    deviceName={report.deviceName}
                                    onOpen={() => navigate(`/reports/${report.id}`)}
                                />
                            ))}
                        </div>
                        <TablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={setPageSize}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default CollaboratorPage;
