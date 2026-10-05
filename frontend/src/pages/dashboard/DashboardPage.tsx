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
import TableActionButton from "@/components/table-action-button";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";

const InterventionsCalendar = lazy(() => import("@/pages/calendar/components/interventions-calendar"));

/**
 * I due dialoghi di creazione si scaricano solo quando servono: con i loro campi (cliente,
 * dispositivo, difetto, i dialoghi annidati per crearli) pesavano sulla prima apertura della
 * dashboard, la pagina iniziale, anche per chi li apre di rado. Il passaggio del mouse o il focus
 * sul pulsante "Nuovo…" li chiede in anticipo, così all'apertura l'animazione non aspetta la rete;
 * con la scorciatoia da tastiera arrivano un attimo dopo, e fino ad allora non si vede niente
 * (`fallback={null}`) invece di un caricamento che lampeggia.
 */
const { Component: CreateReportDialog, prefetch: prefetchCreateReportDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/create/createReportDialog")
);
const { Component: CreateInterventionDialog, prefetch: prefetchCreateInterventionDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/create/createInterventionDialog")
);
import CreateEntityButton from "@/components/create-entity-button";
import { cn, formatEuro } from "@/lib/utils";
import { getMonthLabel, getMonthShortLabel } from "@/lib/monthKey";
import { useNavigate } from "react-router-dom";
import { useCalendarInterventions, type CalendarRange } from "@/pages/calendar/hooks/useCalendarInterventions";
import { usePageShortcut } from "@/hooks/usePageShortcut";
import { useCreateInterventionFlow, useCreateReportFlow } from "@/hooks/useCreateEntityFlow";
import { lazyWithPrefetch, useHasBeenOpen } from "@/lib/lazyDialog";
import { useDashboardStats } from "./useDashboardStats";

/**
 * L'importo sopra la barra, in forma corta: una colonna su sei è larga ~50px su telefono e ~60px
 * anche su desktop (il dialogo è `max-w-md`), e "344.765 €" finiva troncato in "344.7…" a
 * qualunque larghezza. "345k" ci sta sempre; sotto i mille resta il numero intero. L'importo
 * esatto resta nel fumetto e nell'etichetta accessibile della barra, e in grande sopra il grafico
 * per il mese scelto.
 */
const formatBarValueShort = (value: number) =>
    Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value));

const percentFormatter = new Intl.NumberFormat("it-IT", {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
});

/** "—" finché il dato non è arrivato (o se il caricamento è fallito), non un falso zero. */
const formatCount = (value: number | null | undefined) => (value == null ? "—" : String(value));
const formatAmount = (value: number | null | undefined) => (value == null ? "—" : formatEuro(value));

const DashboardPage = () => {
    const navigate = useNavigate();
    const [dialogCreateReportOpen, setDialogCreateReportOpen] = useState(false);
    const [dialogCreateInterventionOpen, setDialogCreateInterventionOpen] = useState(false);
    const hasOpenedCreateReport = useHasBeenOpen(dialogCreateReportOpen);
    const hasOpenedCreateIntervention = useHasBeenOpen(dialogCreateInterventionOpen);
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
    // Contatori, incassi e mese scelto: stato e caricamenti stanno in `useDashboardStats`, con
    // il perché di ogni dettaglio (id della richiesta, annullamento, ritorno dell'etichetta).
    const {
        selectedMonth: selectedRevenueMonth,
        isCurrentMonth: isCurrentRevenueMonth,
        selectMonth: selectRevenueMonth,
        selectPreviousMonth: handlePreviousRevenueMonth,
        selectNextMonth: handleNextRevenueMonth,
        reportStats,
        interventionStats,
        monthlyRevenue,
        monthlyRevenueSeries,
        revenueComparison,
        isLoading,
        hasLoadedOnce: hasLoadedMetricsOnce,
        reloadReportStats,
        reloadInterventionStats,
    } = useDashboardStats();

    const selectedRevenueLabel = useMemo(() => getMonthLabel(selectedRevenueMonth), [selectedRevenueMonth]);

    const maxMonthlyRevenue = useMemo(
        () => monthlyRevenueSeries.reduce((max, point) => Math.max(max, point.value), 0),
        [monthlyRevenueSeries]
    );

    // Un report nuovo cambia contatori e incassi: si ricaricano quelli del mese scelto adesso
    // (`reloadReportStats` lo legge dal ref), non di quello di quando si è aperto il dialogo.
    const handleCreateReport = useCreateReportFlow(reloadReportStats);

    // Un intervento cambia il calendario e i contatori degli interventi, non gli incassi.
    // `useCallback` perché il gestore passa al calendario, che è in `memo`: una funzione nuova a
    // ogni ridisegno della dashboard lo ridisegnerebbe ogni volta.
    const reloadAfterInterventionCreated = useCallback(
        () => Promise.all([loadCalendarEvents(), reloadInterventionStats()]),
        [loadCalendarEvents, reloadInterventionStats]
    );
    const handleCreateIntervention = useCreateInterventionFlow(reloadAfterInterventionCreated);

    const handleRefreshDashboard = async () => {
        await Promise.all([reloadReportStats(), reloadInterventionStats(), loadCalendarEvents()]);
    };

    const goToReportsPage = (visibilityFilter: "open" | "closed") => {
        navigate(`/reports?visibility=${visibilityFilter}`);
    };

    const goToInterventionsPage = (statusFilter: "programmato" | "in_lavorazione" | "completato") => {
        navigate(`/interventions?status=${statusFilter}`);
    };

    return (
        <div className="relative flex min-h-full w-full flex-col gap-4">
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
                                onPointerEnter={prefetchCreateReportDialog}
                                onFocus={prefetchCreateReportDialog}
                            />
                            <CreateEntityButton
                                label="Nuovo intervento"
                                mobileLabel="Intervento"
                                onClick={() => setDialogCreateInterventionOpen(true)}
                                onPointerEnter={prefetchCreateInterventionDialog}
                                onFocus={prefetchCreateInterventionDialog}
                            />
                        </div>
                    </div>
                }
            />

            {/*
                Una griglia vera anche da `sm` in su, non più un flex-wrap: le schede andavano a capo
                dove capitava ("Incassi mese" restava da sola sulla seconda riga a 1440 con la barra
                laterale chiusa) e con `items-start` ognuna era alta quanto il suo testo. Ora le
                celle si stirano (tutte alte uguali per riga, compresa quella degli incassi) e le
                colonne sono 2, 3 o 6, cioè divisori di sei: nessuna scheda resta mai sola.

                Le colonne seguono la larghezza del contenitore, non della finestra, perché la
                barra laterale aperta o chiusa cambia lo spazio di 12rem a parità di finestra. Tre
                colonne da 44rem, cioè tre volte il `sm:min-w-56` delle schede (14rem, vedi
                `cardDashboard.tsx`) più i `gap-4`. Sei da 80rem (1440 con la barra chiusa): lì
                una scheda è larga ~210px, e il minimo di 14rem va tolto (`*:min-w-0!`, con `!`
                perché le schede non accettano classi da fuori), altrimenti ognuna sborderebbe
                dalla sua colonna. Sotto `sm` restano le tre colonne compatte del telefono.
            */}
            <div className="@container">
                <div
                    aria-busy={isLoading}
                    className={cn(
                        "grid grid-cols-3 gap-2 sm:gap-4 sm:@max-[80rem]:gap-3 sm:@max-[44rem]:grid-cols-2 @min-[44rem]:grid-cols-3 @min-[80rem]:grid-cols-6 @min-[80rem]:*:min-w-0!",
                        isLoading && hasLoadedMetricsOnce && "opacity-60 transition-opacity"
                    )}
                >
                    <CardDashboard
                        text="Report aperti"
                        mobileText="Aperti"
                        icon={CircleDashed}
                        number={formatCount(reportStats?.openCount)}
                        iconColor="text-destructive"
                        onClick={() => goToReportsPage("open")}
                    />
                    <CardDashboard
                        text="Report chiusi"
                        mobileText="Chiusi"
                        icon={CircleCheck}
                        number={formatCount(reportStats?.closedCount)}
                        iconColor="text-status-green-foreground"
                        onClick={() => goToReportsPage("closed")}
                    />

                    <CardDashboard
                        text="Interventi programmati"
                        mobileText="Programmati"
                        icon={CalendarClock}
                        number={formatCount(interventionStats?.programmatoCount)}
                        iconColor="text-destructive"
                        onClick={() => goToInterventionsPage("programmato")}
                    />
                    <CardDashboard
                        text="Interventi in lavorazione"
                        mobileText="In lavorazione"
                        icon={Loader}
                        number={formatCount(interventionStats?.inLavorazioneCount)}
                        iconColor="text-action-print"
                        onClick={() => goToInterventionsPage("in_lavorazione")}
                    />
                    <CardDashboard
                        text="Interventi completati"
                        mobileText="Completati"
                        icon={CircleCheck}
                        number={formatCount(interventionStats?.completatoCount)}
                        iconColor="text-status-green-foreground"
                        onClick={() => goToInterventionsPage("completato")}
                    />

                    <Dialog>
                        <DialogTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                // `whitespace-normal` e `text-left` annullano quelli del pulsante: qui
                                // l'etichetta deve poter andare a capo come nelle altre schede.
                                // `pointer-coarse:h-auto`: il pulsante porta a 44px l'altezza sui
                                // touch (`pointer-coarse:h-11`), e quella varrebbe più di `h-auto`.
                                className={cn(
                                    dashboardCardLayoutClassName,
                                    "h-auto justify-items-start border-primary/20 text-left whitespace-normal pointer-coarse:h-auto"
                                )}
                            >
                                <span className={cn(dashboardCardLabelClassName, "font-medium text-primary-text")}>
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

                        {/* Senza `onOpenAutoFocus` il focus finiva sul primo pulsante, la freccia "Mese
                        precedente", e il suo fumetto si apriva da solo sopra l'importo. Ma il solo
                        `preventDefault` lo lasciava sulla scheda sotto il velo, fuori dal dialogo:
                        Tab ripartiva da lì e uno screen reader non annunciava niente. Ora va sul
                        dialogo stesso, che ha già `tabIndex=-1` e si presenta con il suo titolo. */}
                        <DialogContent
                            className="outline-none sm:max-w-md"
                            onOpenAutoFocus={(event) => {
                                event.preventDefault();
                                if (event.currentTarget instanceof HTMLElement) {
                                    event.currentTarget.focus();
                                }
                            }}
                        >
                            <DialogHeader>
                                <DialogTitle>Incassi mese</DialogTitle>
                                <DialogDescription>Andamento degli ultimi 6 mesi.</DialogDescription>
                            </DialogHeader>

                            {/* `min-w-0` sul contenitore e sui suoi figli: un elemento di una griglia non si
                            restringe sotto la larghezza del suo contenuto, e la riga con importo,
                            confronto e "al netto" (più larga dei 358px di un telefono) spingeva
                            fuori dal riquadro la freccia destra e l'ultima barra del grafico. */}
                            <div className="grid min-w-0 gap-3 *:min-w-0">
                                <div className="flex items-center justify-between gap-1 sm:gap-2">
                                    <TableActionButton
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={handlePreviousRevenueMonth}
                                        aria-label="Mese precedente"
                                    >
                                        <ChevronLeft className="size-4" />
                                    </TableActionButton>

                                    <div className="min-w-0 flex-1 text-center">
                                        <div className="text-2xl font-bold sm:text-3xl">
                                            {formatAmount(monthlyRevenue)}
                                        </div>
                                        <div className="mt-1 text-sm text-muted-foreground">{selectedRevenueLabel}</div>
                                        {revenueComparison ? (
                                            // Freccia e segno oltre al colore: l'andamento si legge anche
                                            // senza distinguere il verde dal rosso.
                                            <div
                                                className={cn(
                                                    "mt-1 inline-flex items-start justify-center gap-1 text-sm font-medium",
                                                    revenueComparison.change >= 0
                                                        ? "text-status-green-foreground"
                                                        : "text-destructive"
                                                )}
                                            >
                                                {revenueComparison.change >= 0 ? (
                                                    <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                                ) : (
                                                    <TrendingDown
                                                        className="mt-0.5 size-4 shrink-0"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                {/* Icona e testo in due elementi: con l'icona nel flusso del testo, a
                                                360px andava a capo da sola sopra la scritta. */}
                                                <span>
                                                    {percentFormatter.format(revenueComparison.change)} rispetto{" "}
                                                    {revenueComparison.previousDays != null ? (
                                                        <>
                                                            ai primi {revenueComparison.previousDays} giorni di{" "}
                                                            {revenueComparison.previousMonthLabel}
                                                        </>
                                                    ) : (
                                                        <>
                                                            {/* "ad agosto", "ad aprile", ma "a luglio". */}
                                                            {revenueComparison.previousMonthLabel.startsWith("a")
                                                                ? "ad"
                                                                : "a"}{" "}
                                                            {revenueComparison.previousMonthLabel}
                                                        </>
                                                    )}
                                                </span>
                                            </div>
                                        ) : null}
                                        <div className="mt-2 text-sm text-muted-foreground">
                                            Al netto tecnici esterni:{" "}
                                            <span className="font-semibold text-foreground">
                                                {formatAmount(reportStats?.monthlyNetRevenue)}
                                            </span>
                                        </div>
                                    </div>

                                    <TableActionButton
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={handleNextRevenueMonth}
                                        disabled={isCurrentRevenueMonth}
                                        aria-label="Mese successivo"
                                    >
                                        <ChevronRight className="size-4" />
                                    </TableActionButton>
                                </div>

                                <div className="flex h-36 items-end gap-2 border-b border-border">
                                    {monthlyRevenueSeries.map((point) => {
                                        const isSelected = point.monthKey === selectedRevenueMonth;
                                        const shortLabel = getMonthShortLabel(point.monthKey);
                                        // Al massimo l'80% della colonna: il resto è per l'importo
                                        // scritto sopra, che altrimenti la barra più alta spingerebbe fuori.
                                        const heightPercent =
                                            maxMonthlyRevenue > 0
                                                ? Math.max((point.value / maxMonthlyRevenue) * 80, 3)
                                                : 3;

                                        return (
                                            <button
                                                key={point.monthKey}
                                                type="button"
                                                onClick={() => selectRevenueMonth(point.monthKey)}
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
                                                        "max-w-full truncate text-xs tabular-nums",
                                                        isSelected
                                                            ? "font-semibold text-primary-text"
                                                            : "text-muted-foreground"
                                                    )}
                                                >
                                                    {formatBarValueShort(point.value)}
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

                                <div className="flex gap-2 text-xs text-muted-foreground uppercase">
                                    {monthlyRevenueSeries.map((point) => (
                                        <span
                                            key={point.monthKey}
                                            className={cn(
                                                "flex-1 text-center",
                                                point.monthKey === selectedRevenueMonth &&
                                                    "font-semibold text-primary-text"
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
            </div>

            {/* Il calendario prende tutto lo spazio che resta sotto le schede (`flex-1`), con un
                minimo sotto cui la pagina scorre. Prima aveva un'altezza fissa, `100vh - 16rem`,
                che non teneva conto delle schede: quando queste andavano su due o tre righe (a
                finestra non intera) la pagina scorreva, e rimpicciolirle non avrebbe dato al
                calendario un pixel in più. */}
            <Suspense fallback={<LoadingPage className="min-h-[24rem] flex-1 sm:min-h-[28rem]" />}>
                <InterventionsCalendar
                    className="min-h-[24rem] flex-1 sm:min-h-[28rem]"
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

            {hasOpenedCreateReport ? (
                <Suspense fallback={null}>
                    <CreateReportDialog
                        open={dialogCreateReportOpen}
                        onOpenChange={setDialogCreateReportOpen}
                        onSubmit={handleCreateReport}
                    />
                </Suspense>
            ) : null}

            {hasOpenedCreateIntervention ? (
                <Suspense fallback={null}>
                    <CreateInterventionDialog
                        open={dialogCreateInterventionOpen}
                        onOpenChange={setDialogCreateInterventionOpen}
                        onSubmit={handleCreateIntervention}
                    />
                </Suspense>
            ) : null}
        </div>
    );
};

export default DashboardPage;
