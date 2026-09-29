import { describe, expect, it } from "vitest";
import { getRevenueComparison } from "./revenueComparison";

const series = [
    { monthKey: "2026-01", value: 400, netValue: 400 },
    { monthKey: "2026-02", value: 1000, netValue: 900 },
    { monthKey: "2026-03", value: 1200, netValue: 1100 },
];

describe("getRevenueComparison", () => {
    it("per un mese chiuso confronta con il mese intero prima, dalla serie", () => {
        const comparison = getRevenueComparison({
            selectedMonth: "2026-03",
            isCurrentMonth: false,
            monthlyRevenue: 1200,
            series,
            previousMonthToDate: null,
        });

        expect(comparison).toEqual({ change: 0.2, previousMonthLabel: "febbraio 2026", previousDays: null });
    });

    /** A gennaio il mese prima è il dicembre dell'anno prima, che qui non è nella serie. */
    it("attraversa il cambio d'anno per trovare il mese prima", () => {
        const comparison = getRevenueComparison({
            selectedMonth: "2026-01",
            isCurrentMonth: false,
            monthlyRevenue: 400,
            series: [{ monthKey: "2025-12", value: 800, netValue: 800 }, ...series],
            previousMonthToDate: null,
        });

        expect(comparison).toEqual({ change: -0.5, previousMonthLabel: "dicembre 2025", previousDays: null });
    });

    it("non inventa un confronto senza il mese prima, con il mese prima a zero o senza dati", () => {
        const base = { isCurrentMonth: false, series, previousMonthToDate: null };

        expect(getRevenueComparison({ ...base, selectedMonth: "2025-12", monthlyRevenue: 500 })).toBeNull();
        expect(
            getRevenueComparison({
                ...base,
                selectedMonth: "2026-02",
                monthlyRevenue: 500,
                series: [{ monthKey: "2026-01", value: 0, netValue: 0 }],
            })
        ).toBeNull();
        expect(getRevenueComparison({ ...base, selectedMonth: "2026-03", monthlyRevenue: null })).toBeNull();
    });

    /**
     * Il mese in corso si confronta con il mese prima fino allo stesso giorno: il 10 marzo
     * contro i primi 10 giorni di febbraio, non contro tutto febbraio.
     */
    it("per il mese in corso confronta con il mese prima fino allo stesso giorno", () => {
        const comparison = getRevenueComparison({
            selectedMonth: "2026-03",
            isCurrentMonth: true,
            monthlyRevenue: 600,
            series,
            previousMonthToDate: { revenue: 300, days: 10 },
        });

        expect(comparison).toEqual({ change: 1, previousMonthLabel: "febbraio 2026", previousDays: 10 });
    });

    /**
     * Il 31 marzo contro febbraio: i "primi 28 giorni" di febbraio sono tutto febbraio, e dirlo
     * così sarebbe strano. Con un anno bisestile il mese intero è di 29 giorni.
     */
    it("se i giorni coprono tutto il mese prima non dice 'i primi N giorni'", () => {
        const fullFebruary = getRevenueComparison({
            selectedMonth: "2026-03",
            isCurrentMonth: true,
            monthlyRevenue: 1200,
            series,
            previousMonthToDate: { revenue: 1000, days: 28 },
        });
        const leapFebruaryPartial = getRevenueComparison({
            selectedMonth: "2028-03",
            isCurrentMonth: true,
            monthlyRevenue: 1200,
            series: [],
            previousMonthToDate: { revenue: 1000, days: 28 },
        });

        expect(fullFebruary?.previousDays).toBeNull();
        expect(fullFebruary?.change).toBeCloseTo(0.2);
        expect(leapFebruaryPartial?.previousDays).toBe(28);
    });

    /** Il dato "fino allo stesso giorno" vale solo per il mese in corso, anche se arrivasse. */
    it("per un mese chiuso ignora il dato parziale e usa il mese intero", () => {
        const comparison = getRevenueComparison({
            selectedMonth: "2026-03",
            isCurrentMonth: false,
            monthlyRevenue: 1200,
            series,
            previousMonthToDate: { revenue: 300, days: 10 },
        });

        expect(comparison).toEqual({ change: 0.2, previousMonthLabel: "febbraio 2026", previousDays: null });
    });

    it("per il mese in corso senza il dato parziale ripiega sulla serie", () => {
        const comparison = getRevenueComparison({
            selectedMonth: "2026-03",
            isCurrentMonth: true,
            monthlyRevenue: 1500,
            series,
            previousMonthToDate: null,
        });

        expect(comparison).toEqual({ change: 0.5, previousMonthLabel: "febbraio 2026", previousDays: null });
    });
});
