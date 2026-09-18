import {
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleDashed,
    Euro,
    Loader,
    TrendingDown,
    TrendingUp,
} from "lucide-react";
import CardDashboard, {
    dashboardCardIconClassName,
    dashboardCardLabelClassName,
    dashboardCardLayoutClassName,
    dashboardCardValueClassName,
} from "./components/cardDashboard";
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
} from "@/lib/api";
import { cn, formatEuro, openPrintWindow } from "@/lib/utils";
import { resolveReportReferences, toReportCreatePayload } from "@/lib/reportForm";
import { showCreatedToast } from "@/lib/createdToast";
import { entityPaths } from "@/lib/entityPaths";
import { resolveCustomerId } from "@/lib/customerLookup";
import { toInterventionCreatePayload } from "@/lib/interventionForm";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useCalendarInterventions, type CalendarRange } from "@/pages/calendar/hooks/useCalendarInterventions";
import { usePageShortcut } from "@/hooks/usePageShortcut";

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

/** L'importo sopra la barra: senza decimali, perché lo spazio è quello di una colonna su sei. */
const barValueFormatter = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("it-IT", {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
});

const shiftMonthKey = (monthKey: string, deltaMonths: number) => {
    const [yearPart, monthPart] = monthKey.split("-");
    const date = new Date(Number(yearPart), Number(monthPart) - 1 + deltaMonths, 1);

    return getMonthKey(date);
};

const DashboardPage = () => {
    const navigate = useNavigate();
    const [dialogCreateReportOpen, setDialogCreateReportOpen] = useState(false);
    const [dialogCreateInterventionOpen, setDialogCreateInterventionOpen] = useState(false);
    // Qui i pulsanti di creazione sono due, quindi non c'è una "n" sola che possa valere per
    // entrambi: una lettera per ciascuno, l'iniziale di quello che aprono.
    usePageShortcut("r", () => setDialogCreateReportOpen(true));
    usePageShortcut("i", () => setDialogCreateInterventionOpen(true));
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
    const [monthlyNetRevenue, setMonthlyNetRevenue] = useState(0);
    const [monthlyRevenueSeries, setMonthlyRevenueSeries] = useState<
        { monthKey: string; value: number; netValue: number }[]
    >([]);
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

    /**
     * Il confronto con il mese prima di quello scelto. Prima il riquadro diceva solo la cifra, e
     * per capire se il mese andava bene bisognava passare il mouse sulle barre una per una.
     *
     * Il mese precedente si prende dalla serie (gli ultimi sei mesi): per un mese più vecchio
     * non c'è, e il confronto non si mostra. Con un mese precedente a zero la percentuale non
     * ha senso, e anche lì non si mostra.
     */
    const revenueComparison = useMemo(() => {
        const previousMonthKey = shiftMonthKey(selectedRevenueMonth, -1);
        const previousPoint = monthlyRevenueSeries.find((point) => point.monthKey === previousMonthKey);

        if (!previousPoint || previousPoint.value <= 0) {
            return null;
        }

        return {
            change: (monthlyRevenue - previousPoint.value) / previousPoint.value,
            previousMonthLabel: getMonthLabel(previousMonthKey),
        };
    }, [monthlyRevenue, monthlyRevenueSeries, selectedRevenueMonth]);

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
            setMonthlyNetRevenue(reportStats.monthlyNetRevenue);
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
        const createdReport = await createReport(toReportCreatePayload(values, await resolveReportReferences(values)));

        await loadDashboardMetrics(selectedRevenueMonth);

        showCreatedToast({
            message: `Report #${createdReport.id} creato`,
            onOpen: () => navigate(entityPaths.report(createdReport.id)),
            onPrint: () => openPrintWindow(getReportPrintUrl(createdReport.id)),
        });
    };

    // Come `handleCreateReport` qui sopra, niente try/catch: l'errore lo mostra il dialogo.
    const handleCreateIntervention = async (values: CreateInterventionSubmitValues) => {
        const customerId = await resolveCustomerId(values.customerId, values.customer);
        const createdIntervention = await createIntervention(toInterventionCreatePayload(values, customerId));

        await Promise.all([loadCalendarEvents(), loadDashboardMetrics(selectedRevenueMonth)]);

        showCreatedToast({
            message: `Intervento #${createdIntervention.id} creato`,
            onOpen: () => navigate(entityPaths.intervention(createdIntervention.id)),
            onPrint: () => openPrintWindow(getInterventionPrintUrl(createdIntervention.id)),
        });
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
                    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                        {/* Refresh a sinistra, creazioni (report poi intervento) a destra: sotto
                            `sm` il gruppo prende una riga intera sotto il titolo (`w-full`, perché
                            `PageHeader` affianca titolo e azione) e si allarga ai due estremi con
                            `justify-between`; da `sm` in su torna affiancato al titolo, nello stesso
                            ordine, con `sm:w-auto sm:justify-start`. */}
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
                            // `whitespace-normal` e `text-left` annullano quelli del pulsante: qui
                            // l'etichetta deve poter andare a capo come nelle altre schede.
                            className={cn(
                                dashboardCardLayoutClassName,
                                "h-auto justify-items-start border-primary/20 text-left whitespace-normal"
                            )}
                        >
                            <span className={cn(dashboardCardLabelClassName, "font-medium text-primary")}>
                                Incassi mese
                            </span>
                            <Euro className={cn(dashboardCardIconClassName, "text-action-print")} />
                            <span
                                // Spaziatura larga solo da `sm`: a 320px i sei pallini la usavano
                                // per arrivare sopra l'icona dell'euro.
                                className={cn(dashboardCardValueClassName, "sm:tracking-widest")}
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
                                    {revenueComparison ? (
                                        // Freccia e segno oltre al colore: l'andamento si legge anche
                                        // senza distinguere il verde dal rosso.
                                        <div
                                            className={cn(
                                                "mt-1 inline-flex items-center gap-1 text-sm font-medium",
                                                revenueComparison.change >= 0
                                                    ? "text-green-700 dark:text-green-400"
                                                    : "text-destructive"
                                            )}
                                        >
                                            {revenueComparison.change >= 0 ? (
                                                <TrendingUp className="size-4" aria-hidden="true" />
                                            ) : (
                                                <TrendingDown className="size-4" aria-hidden="true" />
                                            )}
                                            {percentFormatter.format(revenueComparison.change)} rispetto{" "}
                                            {/* "ad agosto", "ad aprile", ma "a luglio". */}
                                            {revenueComparison.previousMonthLabel.startsWith("a") ? "ad" : "a"}{" "}
                                            {revenueComparison.previousMonthLabel}
                                        </div>
                                    ) : null}
                                    <div className="mt-2 text-sm text-muted-foreground">
                                        Al netto tecnici esterni:{" "}
                                        <span className="font-semibold text-foreground">
                                            {formatEuro(monthlyNetRevenue)}
                                        </span>
                                    </div>
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

                            <div className="flex h-36 items-end gap-2 border-b border-border">
                                {monthlyRevenueSeries.map((point) => {
                                    const isSelected = point.monthKey === selectedRevenueMonth;
                                    const shortLabel = getMonthShortLabel(point.monthKey);
                                    // Al massimo l'80% della colonna: il resto è per l'importo
                                    // scritto sopra, che altrimenti la barra più alta spingerebbe fuori.
                                    const heightPercent =
                                        maxMonthlyRevenue > 0 ? Math.max((point.value / maxMonthlyRevenue) * 80, 3) : 3;

                                    return (
                                        <button
                                            key={point.monthKey}
                                            type="button"
                                            onClick={() => setSelectedRevenueMonth(point.monthKey)}
                                            title={`${shortLabel}: ${formatEuro(point.value)}`}
                                            aria-label={`${shortLabel}: ${formatEuro(point.value)}`}
                                            aria-pressed={isSelected}
                                            className="flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1"
                                        >
                                            {/* L'importo sta scritto: prima si leggeva solo nel
                                                fumetto al passaggio del mouse, che su un telefono
                                                non c'è. */}
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "max-w-full truncate text-[10px] tabular-nums sm:text-xs",
                                                    isSelected ? "font-semibold text-primary" : "text-muted-foreground"
                                                )}
                                            >
                                                {barValueFormatter.format(point.value)}
                                            </span>
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
