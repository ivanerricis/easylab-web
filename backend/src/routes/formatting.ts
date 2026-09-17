// Fuso fisso: `formatDayLabel` ci passa la mezzanotte UTC del giorno. Senza, il formattatore
// prende il fuso del processo al momento in cui nasce, cioè all'import.
const dateLabelFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "UTC" });
const dateLabelFormattersByTimeZone = new Map<string, Intl.DateTimeFormat>();

/**
 * La data di un istante (la creazione di un report) nel fuso del laboratorio: alle 00:30 di Roma
 * è già il giorno dopo rispetto all'UTC, e il PDF deve dire il giorno che vede chi lo consegna.
 * Un formattatore per fuso, riusato: costruirne uno a ogni riga di un resoconto costa.
 */
export const formatDateLabel = (value: Date, timeZone: string) => {
    let formatter = dateLabelFormattersByTimeZone.get(timeZone);

    if (!formatter) {
        formatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone });
        dateLabelFormattersByTimeZone.set(timeZone, formatter);
    }

    return formatter.format(value);
};

/**
 * Le date "solo giorno" arrivano come stringhe YYYY-MM-DD e non hanno fuso: si leggono e si
 * scrivono entrambe in UTC, così il giorno resta quello.
 *
 * Prima si leggevano nel fuso del processo (`T00:00:00` senza `Z`) e si scrivevano con un
 * formattatore creato all'import. Ma `companyManager` imposta `process.env.TZ` dopo l'avvio:
 * il formattatore restava in UTC, la lettura passava a Europe/Rome, e la mezzanotte di Roma
 * è ancora il giorno prima in UTC. Nei PDF "dal 1 gen 2030" diventava "Dal 31 dic 2029", e la
 * data dell'intervento nella ricevuta slittava indietro di un giorno.
 */
export const formatDayLabel = (value: string) => dateLabelFormatter.format(new Date(`${value}T00:00:00Z`));

// Un intervallo vuoto non produce etichetta: chi chiama la omette dal PDF.
export const buildDateRangeLabel = (dateFrom?: string, dateTo?: string) => {
    if (dateFrom && dateTo) {
        return `Dal ${formatDayLabel(dateFrom)} al ${formatDayLabel(dateTo)}`;
    }

    if (dateFrom) {
        return `Dal ${formatDayLabel(dateFrom)}`;
    }

    if (dateTo) {
        return `Fino al ${formatDayLabel(dateTo)}`;
    }

    return undefined;
};

export const formatPhoneLabel = (primary?: string | null, secondary?: string | null) => {
    const trimmedPrimary = primary?.trim() ?? "";
    const trimmedSecondary = secondary?.trim() ?? "";

    if (trimmedPrimary && trimmedSecondary) {
        return `${trimmedPrimary} - ${trimmedSecondary}`;
    }

    return trimmedPrimary || trimmedSecondary || "N/D";
};

export const formatScheduleLabel = (
    interventionDate: string | null,
    startTime: string | null,
    endTime: string | null
) => {
    if (!interventionDate) {
        return null;
    }

    const timeRange = startTime && endTime ? `${startTime.slice(0, 5)}-${endTime.slice(0, 5)}` : null;

    return [formatDayLabel(interventionDate), timeRange].filter(Boolean).join(" ");
};
