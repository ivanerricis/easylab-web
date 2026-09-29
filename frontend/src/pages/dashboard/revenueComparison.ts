import type { ReportStatsDto } from "@/lib/api/reports";
import { getMonthLabel, getMonthLength, shiftMonthKey } from "@/lib/monthKey";

type RevenueComparisonInput = {
    /** Il mese scelto, "AAAA-MM". */
    selectedMonth: string;
    isCurrentMonth: boolean;
    /** `null` finché i dati non sono arrivati (o se il caricamento è fallito). */
    monthlyRevenue: number | null;
    series: ReportStatsDto["series"];
    previousMonthToDate: ReportStatsDto["previousMonthToDate"];
};

export type RevenueComparison = {
    /** La variazione rispetto al mese prima: 0.25 è +25%. */
    change: number;
    previousMonthLabel: string;
    /** I giorni del mese prima confrontati, se non è il mese intero; altrimenti `null`. */
    previousDays: number | null;
};

/**
 * Il confronto con il mese prima di quello scelto. Prima il riquadro diceva solo la cifra, e
 * per capire se il mese andava bene bisognava passare il mouse sulle barre una per una.
 *
 * Il mese precedente si prende dalla serie (gli ultimi sei mesi): per un mese più vecchio
 * non c'è, e il confronto non si mostra. Con un mese precedente a zero la percentuale non
 * ha senso, e anche lì non si mostra.
 *
 * Per il mese in corso il confronto è con il mese prima fino allo stesso giorno
 * (`previousMonthToDate`, dal backend): contro il mese intero, il 25 settembre si
 * confrontavano 25 giorni con 31 e il calo usciva quasi sempre, rosso, anche a parità di
 * lavoro. `days` pari alla lunghezza del mese prima (il 30 aprile contro marzo non lo è, il
 * 31 marzo contro febbraio sì) vuol dire che il confronto è già con il mese intero.
 *
 * Fuori da `DashboardPage` perché è la parte con più casi della pagina (mese in corso o no,
 * mese prima fuori dalla serie o a zero, febbraio): così si prova da sola, in
 * `revenueComparison.test.ts`.
 */
export const getRevenueComparison = ({
    selectedMonth,
    isCurrentMonth,
    monthlyRevenue,
    series,
    previousMonthToDate,
}: RevenueComparisonInput): RevenueComparison | null => {
    if (monthlyRevenue == null) {
        return null;
    }

    const previousMonthKey = shiftMonthKey(selectedMonth, -1);
    const previousPoint = series.find((point) => point.monthKey === previousMonthKey);
    const partial =
        isCurrentMonth && previousMonthToDate && previousMonthToDate.days < getMonthLength(previousMonthKey)
            ? previousMonthToDate
            : null;
    const previousValue = isCurrentMonth && previousMonthToDate ? previousMonthToDate.revenue : previousPoint?.value;

    if (previousValue == null || previousValue <= 0) {
        return null;
    }

    return {
        change: (monthlyRevenue - previousValue) / previousValue,
        previousMonthLabel: getMonthLabel(previousMonthKey),
        previousDays: partial?.days ?? null,
    };
};
