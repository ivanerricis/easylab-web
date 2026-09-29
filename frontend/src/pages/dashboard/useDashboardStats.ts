import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage, getInterventionStats, getReportStats } from "@/lib/api";
import type { InterventionStatsDto } from "@/lib/api/interventions";
import type { ReportStatsDto } from "@/lib/api/reports";
import { getMonthKey, shiftMonthKey } from "@/lib/monthKey";
import { getRevenueComparison } from "./revenueComparison";

/**
 * Lo stato dei numeri della dashboard in un oggetto solo. Erano sei `useState` separati sparsi
 * nella pagina, fra calendario e dialoghi: qui stanno insieme, con i caricamenti che li scrivono.
 */
type DashboardStatsState = {
    /** Il mese degli incassi, "AAAA-MM". */
    selectedMonth: string;
    // `null` finché non arriva una risposta: su errore la scheda mostra "—" e non un falso
    // "0,00 €" (o "0 report aperti"), indistinguibile da un mese davvero vuoto.
    reportStats: ReportStatsDto | null;
    interventionStats: InterventionStatsDto | null;
    isReportStatsLoading: boolean;
    isInterventionStatsLoading: boolean;
    /**
     * Come nelle liste: il velo che copre tutto ha senso solo quando non c'è ancora niente da
     * vedere. Dal secondo caricamento in poi (cambio mese, pulsante Aggiorna) i numeri precedenti
     * restano leggibili e attenuati, così cliccare due volte la freccia del mese non finisce
     * contro un velo che intercetta il clic.
     */
    hasLoadedOnce: boolean;
};

/**
 * I contatori e gli incassi della dashboard: stato, caricamenti e mese scelto.
 *
 * Stavano dentro `DashboardPage`, che fra questo, il calendario, i dialoghi e il grafico era
 * arrivata a oltre settecento righe. Il comportamento è lo stesso di prima, e i test della
 * pagina (`DashboardPage.test.tsx`) lo provano da fuori.
 */
export const useDashboardStats = () => {
    const [state, setState] = useState<DashboardStatsState>(() => ({
        selectedMonth: getMonthKey(new Date()),
        reportStats: null,
        interventionStats: null,
        isReportStatsLoading: true,
        isInterventionStatsLoading: true,
        hasLoadedOnce: false,
    }));
    const { selectedMonth, reportStats } = state;
    // Il mese scelto anche in un ref, per chi lo legge dopo un `await`: la creazione di un report
    // ricaricava gli incassi del mese catturato all'apertura del dialogo, anche se nel frattempo
    // se n'era scelto un altro.
    const selectedMonthRef = useRef(state.selectedMonth);
    // L'ultimo mese i cui dati sono arrivati davvero: se il caricamento di un altro fallisce,
    // l'etichetta torna qui, sui numeri che sono ancora a schermo.
    const loadedMonthRef = useRef<string | null>(null);
    // Come in `usePaginatedRows` e `useCalendarInterventions`: vale solo la risposta più recente.
    // Sfogliando i mesi in fretta partiva una richiesta per mese, e quella di un mese già
    // superato poteva arrivare per ultima e scrivere i suoi incassi sotto l'etichetta dell'altro.
    const latestReportStatsRequestIdRef = useRef(0);
    const latestInterventionStatsRequestIdRef = useRef(0);
    const reportStatsAbortRef = useRef<AbortController | null>(null);

    // All'uscita dalla dashboard non resta in volo una richiesta di incassi.
    useEffect(() => () => reportStatsAbortRef.current?.abort(), []);

    /**
     * Gli incassi (e i contatori dei report) di un mese. Il mese si chiede qui, non con un
     * effetto sul mese scelto: così su errore l'etichetta può tornare all'ultimo mese caricato
     * senza che quel ritorno faccia partire un'altra richiesta, destinata a fallire di nuovo.
     *
     * La richiesta superata viene anche annullata, come nel calendario: il controllo sull'id
     * basterebbe a scartarne la risposta, ma così il server non calcola un mese che nessuno
     * guarderà più.
     */
    const loadReportStats = useCallback(async (month: string) => {
        const requestId = latestReportStatsRequestIdRef.current + 1;
        latestReportStatsRequestIdRef.current = requestId;
        reportStatsAbortRef.current?.abort();
        const controller = new AbortController();
        reportStatsAbortRef.current = controller;
        setState((previous) => ({ ...previous, isReportStatsLoading: true }));

        try {
            const stats = await getReportStats(month, controller.signal);

            if (requestId !== latestReportStatsRequestIdRef.current) {
                return;
            }

            loadedMonthRef.current = month;
            setState((previous) => ({ ...previous, reportStats: stats }));
        } catch (error) {
            if (requestId !== latestReportStatsRequestIdRef.current) {
                return;
            }

            toast.error(getApiErrorMessage(error, "Impossibile caricare i dati dashboard"));

            // L'etichetta torna al mese dei numeri a schermo. Senza un mese caricato resta
            // quella scelta, e i numeri sono "—".
            const loadedMonth = loadedMonthRef.current;
            if (loadedMonth) {
                selectedMonthRef.current = loadedMonth;
                setState((previous) => ({ ...previous, selectedMonth: loadedMonth }));
            }
        } finally {
            if (requestId === latestReportStatsRequestIdRef.current) {
                setState((previous) => ({ ...previous, isReportStatsLoading: false }));
            }
        }
    }, []);

    /**
     * I contatori degli interventi non dipendono dal mese: prima si richiedevano a ogni freccia
     * del grafico degli incassi. Ora al montaggio, con "Aggiorna" e dopo la creazione di un
     * intervento, cioè quando possono essere cambiati.
     */
    const reloadInterventionStats = useCallback(async () => {
        const requestId = latestInterventionStatsRequestIdRef.current + 1;
        latestInterventionStatsRequestIdRef.current = requestId;
        setState((previous) => ({ ...previous, isInterventionStatsLoading: true }));

        try {
            const stats = await getInterventionStats();

            if (requestId === latestInterventionStatsRequestIdRef.current) {
                setState((previous) => ({ ...previous, interventionStats: stats }));
            }
        } catch (error) {
            if (requestId === latestInterventionStatsRequestIdRef.current) {
                toast.error(getApiErrorMessage(error, "Impossibile caricare i dati dashboard"));
            }
        } finally {
            if (requestId === latestInterventionStatsRequestIdRef.current) {
                setState((previous) => ({ ...previous, isInterventionStatsLoading: false }));
            }
        }
    }, []);

    /**
     * Ricarica gli incassi del mese scelto *adesso*, letto dal ref: dopo la creazione di un report
     * (che arriva dopo un `await`) o con "Aggiorna". Stabile, così la si può passare a
     * `useCreateReportFlow` senza ricreare il gestore a ogni ridisegno.
     */
    const reloadReportStats = useCallback(() => loadReportStats(selectedMonthRef.current), [loadReportStats]);

    // Solo al montaggio: il cambio di mese chiede i suoi dati da sé (`selectMonth`).
    useEffect(() => {
        startTransition(() => {
            void Promise.all([loadReportStats(selectedMonthRef.current), reloadInterventionStats()]).finally(() =>
                setState((previous) => ({ ...previous, hasLoadedOnce: true }))
            );
        });
    }, [reloadInterventionStats, loadReportStats]);

    const selectMonth = (month: string) => {
        selectedMonthRef.current = month;
        setState((previous) => ({ ...previous, selectedMonth: month }));
        void loadReportStats(month);
    };

    const isCurrentMonth = selectedMonth === getMonthKey(new Date());

    // Dal ref e non dallo stato: due clic nello stesso istante partono entrambi dal mese giusto.
    const selectPreviousMonth = () => selectMonth(shiftMonthKey(selectedMonthRef.current, -1));
    const selectNextMonth = () => {
        if (selectedMonthRef.current === getMonthKey(new Date())) {
            return;
        }
        selectMonth(shiftMonthKey(selectedMonthRef.current, 1));
    };

    const monthlyRevenue = reportStats?.monthlyRevenue ?? null;
    const monthlyRevenueSeries = useMemo(() => reportStats?.series ?? [], [reportStats]);
    const previousMonthToDate = reportStats?.previousMonthToDate ?? null;

    const revenueComparison = useMemo(
        () =>
            getRevenueComparison({
                selectedMonth,
                isCurrentMonth,
                monthlyRevenue,
                series: monthlyRevenueSeries,
                previousMonthToDate,
            }),
        [isCurrentMonth, monthlyRevenue, monthlyRevenueSeries, previousMonthToDate, selectedMonth]
    );

    return {
        selectedMonth,
        isCurrentMonth,
        selectMonth,
        selectPreviousMonth,
        selectNextMonth,
        reportStats,
        interventionStats: state.interventionStats,
        monthlyRevenue,
        monthlyRevenueSeries,
        revenueComparison,
        isLoading: state.isReportStatsLoading || state.isInterventionStatsLoading,
        hasLoadedOnce: state.hasLoadedOnce,
        reloadReportStats,
        reloadInterventionStats,
    };
};
