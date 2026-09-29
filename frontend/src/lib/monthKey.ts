/**
 * Il mese come lo scambiano frontend e backend: "AAAA-MM" (es. "2026-09"), il formato di
 * `getReportStats` e dei `monthKey` della serie degli incassi.
 *
 * Queste funzioni stavano in fondo a `DashboardPage`, mescolate al disegno della pagina, senza un
 * test: e sono proprio i conti che sbagliano senza farsi notare — il cambio d'anno sfogliando i
 * mesi, la lunghezza di febbraio nel confronto "fino allo stesso giorno". Qui si provano da sole
 * (`monthKey.test.ts`).
 *
 * Tutte lavorano sull'ora locale, come il resto della dashboard: il "mese corrente" è quello del
 * calendario di chi guarda, non quello di UTC (che a mezzanotte del primo del mese è ancora il
 * mese prima).
 */

/** Il mese di una data, es. `new Date(2026, 8, 11)` → "2026-09". */
export const getMonthKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
};

/** Anno e mese (1-12) di una chiave; `null` se la chiave non è un mese valido. */
const parseMonthKey = (monthKey: string) => {
    const [yearPart, monthPart] = monthKey.split("-");
    const year = Number(yearPart);
    const month = Number(monthPart);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    return { year, month };
};

/**
 * Il mese spostato di `deltaMonths` (anche negativo). È `Date` a fare il riporto: il mese 0 è il
 * dicembre dell'anno prima, il 13 il gennaio dopo, quindi il cambio d'anno non ha casi a parte.
 */
export const shiftMonthKey = (monthKey: string, deltaMonths: number) => {
    const [yearPart, monthPart] = monthKey.split("-");
    const date = new Date(Number(yearPart), Number(monthPart) - 1 + deltaMonths, 1);

    return getMonthKey(date);
};

/** "settembre 2026". Una chiave non valida torna com'è, invece di un "Invalid Date". */
export const getMonthLabel = (monthKey: string) => {
    const parsed = parseMonthKey(monthKey);

    if (!parsed) {
        return monthKey;
    }

    return new Intl.DateTimeFormat("it-IT", {
        month: "long",
        year: "numeric",
    }).format(new Date(parsed.year, parsed.month - 1, 1));
};

/** "set", sotto le barre del grafico degli incassi. */
export const getMonthShortLabel = (monthKey: string) => {
    const [yearPart, monthPart] = monthKey.split("-");

    return new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
        new Date(Number(yearPart), Number(monthPart) - 1, 1)
    );
};

/**
 * Quanti giorni ha il mese (28-31, febbraio bisestile compreso). Il giorno 0 del mese dopo è
 * l'ultimo di questo: il conto lo fa `Date`, bisestili dei secoli compresi.
 */
export const getMonthLength = (monthKey: string) => {
    const [year, month] = monthKey.split("-").map(Number);

    return new Date(year, month, 0).getDate();
};
