/**
 * Giorni e mesi nel fuso del laboratorio, per colonne `timestamp` che contengono l'ora UTC.
 *
 * I timestamp si scrivono in UTC (il `now()` di Postgres gira in UTC, drizzle manda
 * `toISOString()` e rilegge con `+0000`), ma "il 14 settembre" per chi usa l'app è il giorno
 * del laboratorio. Prima i filtri confrontavano `created_at::date`, cioè il giorno UTC: un report
 * creato alle 00:30 di Roma (22:30 UTC del giorno prima) cercato sul suo giorno non si trovava. E
 * il cast calcolato su ogni riga impediva a Postgres di usare l'indice su `created_at`.
 *
 * Qui gli estremi si calcolano una volta, come costanti: inizio del giorno nel fuso, convertito
 * nell'ora UTC in cui è salvata la colonna. Il confronto resta sulla colonna nuda, e l'indice
 * torna utilizzabile. Il fuso passa come parametro della query, mai concatenato nel testo.
 */
import { and, gte, lt, sql, type SQL, type SQLWrapper } from "drizzle-orm";

/** Mezzanotte del giorno `day` (YYYY-MM-DD) nel fuso `timeZone`, espressa in ora UTC. */
export const localDayStartUtc = (day: string, timeZone: string): SQL =>
    sql`(((${day}::date)::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC')`;

/** Mezzanotte del giorno dopo `day`: l'estremo escluso di un intervallo che comprende `day`. */
const localNextDayStartUtc = (day: string, timeZone: string): SQL =>
    sql`(((${day}::date + 1)::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC')`;

/**
 * La condizione "creato fra il giorno `from` e il giorno `to` compresi", nel fuso del laboratorio.
 * Uno dei due estremi può mancare; senza entrambi non c'è condizione.
 */
export const onLocalDays = (
    column: SQLWrapper,
    { from, to }: { from?: string; to?: string },
    timeZone: string
): SQL | undefined => {
    const conditions = [
        from ? gte(column, localDayStartUtc(from, timeZone)) : undefined,
        to ? lt(column, localNextDayStartUtc(to, timeZone)) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);

    return conditions.length > 0 ? and(...conditions) : undefined;
};

/** Il timestamp UTC della colonna portato all'ora del laboratorio (sempre `timestamp` senza fuso). */
export const toLocalTimestamp = (column: SQLWrapper, timeZone: string): SQL =>
    sql`(((${column}) AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})`;

/**
 * Anno e mese correnti nel fuso indicato, come `YYYY-MM`: il "mese corrente" dei totali della
 * dashboard è quello del laboratorio, non quello del processo.
 */
export const currentMonthKey = (timeZone: string, now = new Date()): string => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;

    return `${year}-${month}`;
};
