import { formatDateISO } from "@/lib/utils";

/**
 * Orario suggerito per un aggiornamento programmato: le 03:00. Non le 02:00, che è l'orario
 * di serie del backup notturno: i due lavori non devono partire insieme (e se si incrociano
 * lo scheduler rimanda l'aggiornamento, ma è meglio non contarci).
 */
export const suggestedUpdateTime = "03:00";

/** Quanto in anticipo, come minimo, deve essere l'orario scelto: lo stesso limite del server. */
const minLeadMs = 2 * 60 * 1000;
/** Quanto lontano si può programmare: lo stesso limite del server. */
const maxLeadDays = 30;

const pad = (value: number) => String(value).padStart(2, "0");

/** Le 03:00 della prossima notte: oggi se mancano più di cinque minuti, altrimenti domani. */
export const suggestedUpdateSchedule = (now: Date = new Date()) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0);

    if (day.getTime() - now.getTime() < 5 * 60 * 1000) {
        day.setDate(day.getDate() + 1);
    }

    return { date: formatDateISO(day), time: suggestedUpdateTime };
};

/** Data e ora (come i campi del dialogo) di un istante ISO già programmato. */
export const toScheduleFields = (iso: string) => {
    const instant = new Date(iso);

    return { date: formatDateISO(instant), time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}` };
};

const weekdayFormatter = new Intl.DateTimeFormat("it-IT", { weekday: "long" });
const dayMonthFormatter = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

/** "giovedì 14/11 alle 03:00": per il riquadro e il banner. */
export const formatScheduledMoment = (iso: string) => {
    const instant = new Date(iso);

    return `${weekdayFormatter.format(instant)} ${dayMonthFormatter.format(instant)} alle ${timeFormatter.format(instant)}`;
};

/**
 * I controlli che si possono fare senza il server: campi vuoti, orario passato, oltre 30 giorni.
 * Gli altri (ora inesistente per l'ora legale, nessun aggiornamento disponibile) restano al
 * server, che risponde con un messaggio da mostrare.
 */
export const validateUpdateSchedule = (
    { date, time }: { date: string; time: string },
    now: Date = new Date()
): { date?: string; time?: string } => {
    const errors: { date?: string; time?: string } = {};
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);

    if (!dateMatch) {
        errors.date = "Scegli la data";
    }

    if (!timeMatch) {
        errors.time = "Scegli l'ora";
    }

    if (!dateMatch || !timeMatch) {
        return errors;
    }

    const instant = new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        Number(timeMatch[1]),
        Number(timeMatch[2])
    );
    const lead = instant.getTime() - now.getTime();

    if (lead < minLeadMs) {
        errors.time = "Scegli un orario futuro, ad almeno qualche minuto da adesso";
    } else if (lead > maxLeadDays * 24 * 60 * 60 * 1000) {
        errors.date = `Al massimo entro ${maxLeadDays} giorni`;
    }

    return errors;
};
