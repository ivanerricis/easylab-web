import { CalendarClock, ChevronLeft, ChevronRight, CircleCheck, CircleDashed, Euro, Loader } from "lucide-react";
import CardDashboard from "./components/cardDashboard";
import CreateReportDialog, { type CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import CreateInterventionDialog, {
    type CreateInterventionSubmitValues,
} from "@/components/dialogs/create/createInterventionDialog";
import LoadingPage from "@/components/loadingPage";
import PageHeader from "@/components/page-header";
import RefreshButton from "@/components/refresh-button";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useState } from "react";

const InterventionsCalendar = lazy(() => import("@/pages/calendar/components/interventions-calendar"));
import CreateEntityButton from "@/components/create-entity-button";
import {
    createIntervention,
    createReport,
    getReportPrintUrl,
    getInterventionPrintUrl,
    getApiErrorMessage,
    getInterventionStats,
    getReportStats,
    listCustomers,
} from "@/lib/api";
import { cn, formatEuro, openPrintWindow, trimOrNull } from "@/lib/utils";
import { resolveReportReferences } from "@/lib/reportForm";
import { formatCustomerOption } from "@/lib/customers";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useCalendarInterventions, type CalendarRange } from "@/pages/calendar/hooks/useCalendarInterventions";

const getMonthKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
};

const getMonthLabel = (monthKey: string) => {
    const [yearPart, monthPart] = monthKey.split("-");
    const year = Number(yearPart);
    const month = Number(monthPart);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return monthKey;
    }

    return new Intl.DateTimeFormat("it-IT", {
        month: "long",
        year: "numeric",
    }).format(new Date(year, month - 1, 1));
};

const getMonthShortLabel = (monthKey: string) => {
    const [yearPart, monthPart] = monthKey.split("-");

    return new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
        new Date(Number(yearPart), Number(monthPart) - 1, 1)
    );
};

const shiftMonthKey = (monthKey: string, deltaMonths: number) => {
    const [yearPart, monthPart] = monthKey.split("-");
    const date = new Date(Number(yearPart), Number(monthPart) - 1 + deltaMonths, 1);

    return getMonthKey(date);
};

const DashboardPage = () => {
    const navigate = useNavigate();
    const [dialogCreateReportOpen, setDialogCreateReportOpen] = useState(false);
    const [dialogCreateInterventionOpen, setDialogCreateInterventionOpen] = useState(false);
    // L'intervallo lo decide il calendario, che è l'unico a sapere quali giorni sta
    // disegnando; qui viene solo tenuto in stato per poterlo passare al caricamento.
    // Confrontare i due estremi evita di rilanciare la richiesta quando il calendario
    // ripete lo stesso intervallo (lo fa a ogni ridisegno).
    const [calendarRange, setCalendarRange] = useState<CalendarRange | null>(null);
    const handleCalendarRangeChange = useCallback((nextRange: CalendarRange) => {
        setCalendarRange((previous) =>
            previous && previous.from === nextRange.from && previous.to === nextRange.to ? previous : nextRange
        );
    }, []);
    const {
        events: calendarEvents,
        isLoading: isCalendarLoading,
        isInitialLoading: isCalendarInitialLoading,
        loadEvents: loadCalendarEvents,
    } = useCalendarInterventions(calendarRange);
    const [selectedRevenueMonth, setSelectedRevenueMonth] = useState(() => getMonthKey(new Date()));
    const [openReports, setOpenReports] = useState(0);
    const [closedReports, setClosedReports] = useState(0);
    const [monthlyRevenue, setMonthlyRevenue] = useState(0);
    const [monthlyRevenueSeries, setMonthlyRevenueSeries] = useState<{ monthKey: string; value: number }[]>([]);
    const [scheduledInterventions, setScheduledInterventions] = useState(0);
    const [inProgressInterventions, setInProgressInterventions] = useState(0);
    const [completedInterventions, setCompletedInterventions] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    // Come nelle liste: il velo che copre tutto ha senso solo quando non c'è ancora niente
    // da vedere. Dal secondo caricamento in poi (cambio mese, pulsante Aggiorna) i numeri
    // precedenti restano leggibili e attenuati, così cliccare due volte la freccia del mese
    // non finisce contro un velo che intercetta il clic.
    const [hasLoadedMetricsOnce, setHasLoadedMetricsOnce] = useState(false);

    const selectedRevenueLabel = useMemo(() => getMonthLabel(selectedRevenueMonth), [selectedRevenueMonth]);

    const isCurrentRevenueMonth = selectedRevenueMonth === getMonthKey(new Date());

    const handlePreviousRevenueMonth = () => setSelectedRevenueMonth((prev) => shiftMonthKey(prev, -1));
    const handleNextRevenueMonth = () => {
        if (isCurrentRevenueMonth) {
            return;
        }
        setSelectedRevenueMonth((prev) => shiftMonthKey(prev, 1));
    };

    const maxMonthlyRevenue = useMemo(
        () => monthlyRevenueSeries.reduce((max, point) => Math.max(max, point.value), 0),
        [monthlyRevenueSeries]
    );

    const loadDashboardMetrics = async (month: string) => {
        setIsLoading(true);
        try {
            const [reportStats, interventionStats] = await Promise.all([getReportStats(month), getInterventionStats()]);

            setOpenReports(reportStats.openCount);
            setClosedReports(reportStats.closedCount);
            setMonthlyRevenue(reportStats.monthlyRevenue);
            setMonthlyRevenueSeries(reportStats.series);
            setScheduledInterventions(interventionStats.programmatoCount);
            setInProgressInterventions(interventionStats.inLavorazioneCount);
            setCompletedInterventions(interventionStats.completatoCount);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare i dati dashboard"));
        } finally {
            setIsLoading(false);
            setHasLoadedMetricsOnce(true);
        }
    };

    const handleCreateReport = async (values: CreateReportSubmitValues) => {
        const { customerId, deviceId, issueId, issueDescription } = await resolveReportReferences(values);

        const createdReport = await createReport({
            deviceId,
            issueId,
            customerId,
            note: trimOrNull(values.notes),
            password: trimOrNull(values.password),
            issueDescription,
            dataBackup: values.dataBackup,
            charger: values.charger,
        });

        await loadDashboardMetrics(selectedRevenueMonth);

        if (window.confirm("Report creato. Vuoi stamparlo adesso?")) {
            openPrintWindow(getReportPrintUrl(createdReport.id));
        }
    };

    const handleCreateIntervention = async (values: CreateInterventionSubmitValues) => {
        try {
            let customerId = values.customerId;

            if (customerId == null) {
                const customers = await listCustomers();
                const selectedCustomer = customers.find(
                    (customer) =>
                        formatCustomerOption(
                            customer.firstName,
                            customer.lastName,
                            customer.phoneNumber,
                            customer.phoneNumberSecondary
                        ) === values.customer
                );

                if (!selectedCustomer) {
                    throw new Error("Seleziona un cliente esistente o creane uno nuovo.");
                }

                customerId = selectedCustomer.id;
            }

            const createdIntervention = await createIntervention({
                type: values.type,
                status: values.status,
                description: values.description,
                problem: values.problem,
                customerId,
                collaboratorId: values.collaboratorId,
                interventionDate: values.interventionDate,
                startTime: values.startTime,
                endTime: values.endTime,
            });

            await Promise.all([loadCalendarEvents(), loadDashboardMetrics(selectedRevenueMonth)]);

            if (window.confirm("Intervento creato. Vuoi stamparlo adesso?")) {
                openPrintWindow(getInterventionPrintUrl(createdIntervention.id));
            }
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile creare l'intervento"));
            throw error;
        }
    };

    useEffect(() => {
        startTransition(() => {
            void loadDashboardMetrics(selectedRevenueMonth);
        });
    }, [selectedRevenueMonth]);

    const handleRefreshDashboard = async () => {
        await Promise.all([loadDashboardMetrics(selectedRevenueMonth), loadCalendarEvents()]);
    };

    const goToReportsPage = (visibilityFilter: "open" | "closed") => {
        navigate(`/reports?visibility=${visibilityFilter}`);
    };

    const goToInterventionsPage = (statusFilter: "programmato" | "in_lavorazione" | "completato") => {
        navigate(`/interventions?status=${statusFilter}`);
    };

    return (
        <div className="relative flex w-full flex-col gap-4">
            <PageHeader
                title="Dashboard"
                description="Panoramica del laboratorio e stato delle riparazioni."
                action={
                    <div className="flex items-center justify-between gap-2 sm:justify-start">
                        {/* Refresh a sinistra, creazioni (report poi intervento) a destra: sotto
                            `sm` il gruppo si allarga ai due estremi con `justify-between`, da
                            `sm` in su torna affiancato nello stesso ordine con `sm:justify-start`. */}
                        <RefreshButton
                            onRefresh={handleRefreshDashboard}
                            isRefreshing={isLoading || isCalendarLoading}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <CreateEntityButton
                                label="Nuovo report"
                                mobileLabel="Report"
                                onClick={() => setDialogCreateReportOpen(true)}
                            />
                            <CreateEntityButton
                                label="Nuovo intervento"
                                mobileLabel="Intervento"
                                onClick={() => setDialogCreateInterventionOpen(true)}
                            />
                        </div>
                    </div>
                }
            />

            <div
                aria-busy={isLoading}
                className={cn(
                    "grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-start sm:gap-4",
                    isLoading && hasLoadedMetricsOnce && "opacity-60 transition-opacity"
                )}
            >
                <CardDashboard
                    text="Report aperti"
                    mobileText="Aperti"
                    icon={CircleDashed}
                    number={String(openReports)}
                    iconColor="text-destructive"
                    onClick={() => goToReportsPage("open")}
                />
                <CardDashboard
                    text="Report chiusi"
                    mobileText="Chiusi"
                    icon={CircleCheck}
                    number={String(closedReports)}
                    iconColor="text-green-700 dark:text-green-400"
                    onClick={() => goToReportsPage("closed")}
                />

                <CardDashboard
                    text="Interventi programmati"
                    mobileText="Programmati"
                    icon={CalendarClock}
                    number={String(scheduledInterventions)}
                    iconColor="text-destructive"
                    onClick={() => goToInterventionsPage("programmato")}
                />
                <CardDashboard
                    text="Interventi in lavorazione"
                    mobileText="In lavorazione"
                    icon={Loader}
                    number={String(inProgressInterventions)}
                    iconColor="text-action-print"
                    onClick={() => goToInterventionsPage("in_lavorazione")}
                />
                <CardDashboard
                    text="Interventi completati"
                    mobileText="Completati"
                    icon={CircleCheck}
                    number={String(completedInterventions)}
                    iconColor="text-green-700 dark:text-green-400"
                    onClick={() => goToInterventionsPage("completato")}
                />

                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-auto w-full flex-1 flex-col items-start gap-0.5 rounded-lg border-primary/20 p-2 shadow sm:min-w-56 sm:gap-1 sm:p-4"
                        >
                            <div className="flex w-full items-start justify-between gap-1">
                                <span className="truncate text-xs font-medium text-primary sm:text-base">
                                    Incassi mese
                                </span>
                                <Euro className="size-4 shrink-0 text-action-print sm:size-5" />
                            </div>
                            <span
                                className="text-lg font-bold tracking-widest sm:text-2xl"
                                aria-label="Importo nascosto, apri la card per visualizzarlo"
                            >
                                ••••••
                            </span>
                        </Button>
                    </DialogTrigger>

                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Incassi mese</DialogTitle>
                            <DialogDescription>Andamento degli ultimi 6 mesi.</DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-3">
                            <div className="flex items-center justify-between gap-2">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={handlePreviousRevenueMonth}
                                            aria-label="Mese precedente"
                                        >
                                            <ChevronLeft className="size-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Mese precedente</TooltipContent>
                                </Tooltip>

                                <div className="text-center">
                                    <div className="text-3xl font-bold">{formatEuro(monthlyRevenue)}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">{selectedRevenueLabel}</div>
                                </div>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={handleNextRevenueMonth}
                                            disabled={isCurrentRevenueMonth}
                                            aria-label="Mese successivo"
                                        >
                                            <ChevronRight className="size-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Mese successivo</TooltipContent>
                                </Tooltip>
                            </div>

                            <div className="flex h-32 items-end gap-2 border-b border-border">
                                {monthlyRevenueSeries.map((point) => {
                                    const isSelected = point.monthKey === selectedRevenueMonth;
                                    const shortLabel = getMonthShortLabel(point.monthKey);
                                    const heightPercent =
                                        maxMonthlyRevenue > 0
                                            ? Math.max((point.value / maxMonthlyRevenue) * 100, 4)
                                            : 4;

                                    return (
                                        <button
                                            key={point.monthKey}
                                            type="button"
                                            onClick={() => setSelectedRevenueMonth(point.monthKey)}
                                            title={`${shortLabel}: ${formatEuro(point.value)}`}
                                            aria-label={`${shortLabel}: ${formatEuro(point.value)}`}
                                            className="flex h-full flex-1 cursor-pointer flex-col items-end justify-end"
                                        >
                                            <div
                                                className={cn(
                                                    "w-full rounded-t-[4px] transition-colors",
                                                    isSelected
                                                        ? "bg-primary"
                                                        : "bg-muted-foreground/25 hover:bg-muted-foreground/40"
                                                )}
                                                style={{ height: `${heightPercent}%` }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-2 text-[10px] text-muted-foreground uppercase">
                                {monthlyRevenueSeries.map((point) => (
                                    <span
                                        key={point.monthKey}
                                        className={cn(
                                            "flex-1 text-center",
                                            point.monthKey === selectedRevenueMonth && "font-semibold text-primary"
                                        )}
                                    >
                                        {getMonthShortLabel(point.monthKey)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <Suspense fallback={<LoadingPage className="h-[calc(100vh-16rem)] min-h-[24rem] sm:min-h-[28rem]" />}>
                <InterventionsCalendar
                    className="h-[calc(100vh-16rem)] min-h-[24rem] sm:min-h-[28rem]"
                    events={calendarEvents}
                    isLoading={isCalendarLoading}
                    isInitialLoading={isCalendarInitialLoading}
                    onCreateIntervention={handleCreateIntervention}
                    onRangeChange={handleCalendarRangeChange}
                />
            </Suspense>

            {isLoading && !hasLoadedMetricsOnce ? (
                <LoadingPage className="absolute inset-0 z-10 rounded-2xl bg-background/70 backdrop-blur-sm" />
            ) : null}

            <CreateReportDialog
                open={dialogCreateReportOpen}
                onOpenChange={setDialogCreateReportOpen}
                onSubmit={handleCreateReport}
            />

            <CreateInterventionDialog
                open={dialogCreateInterventionOpen}
                onOpenChange={setDialogCreateInterventionOpen}
                onSubmit={handleCreateIntervention}
            />
        </div>
    );
};

export default DashboardPage;
