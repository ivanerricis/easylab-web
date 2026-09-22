import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function openPrintWindow(url: string) {
    // "noopener"/"noreferrer" as window features make window.open() always return null,
    // even when the popup opens fine, so that can't be used to detect real blocking.
    const printWindow = window.open(url, "_blank");

    if (!printWindow) {
        toast.error("Popup bloccato dal browser. Consenti i popup per aprire la stampa.");
        return null;
    }

    printWindow.opener = null;
    return printWindow;
}

/**
 * I formattatori si creano una volta sola, non a ogni chiamata: costruirne uno costa molto più
 * che usarlo, e le tabelle ne chiamano uno per cella a ogni render (con "Tutte", migliaia). Il
 * fuso è quello del dispositivo (CHANGELOG del 2026-09-15), che per una pagina aperta non cambia.
 */
const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const euroFormatter = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const formatDateWith = (formatter: Intl.DateTimeFormat, value: string | null | undefined) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return formatter.format(date);
};

export function formatDateTime(value: string | null | undefined) {
    return formatDateWith(dateTimeFormatter, value);
}

export function formatDate(value: string | null | undefined) {
    return formatDateWith(dateFormatter, value);
}

/**
 * "5 minuti fa", "2 giorni fa": la distanza da adesso, per i dati in cui conta quanto sono
 * recenti più della data esatta (l'ultimo utilizzo di una sessione, per esempio). Sotto il
 * minuto non si scrive "0 minuti fa" ma "adesso", e le date future — orologi non allineati
 * fra browser e server — si appiattiscono lì invece di diventare "fra 3 secondi".
 */
export function formatRelativeTime(value: string | null | undefined, now: Date = new Date()) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    const elapsedSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    if (elapsedSeconds < 60) {
        return "adesso";
    }

    const formatter = new Intl.RelativeTimeFormat("it-IT", { numeric: "always" });
    const steps: [Intl.RelativeTimeFormatUnit, number][] = [
        ["minute", 60],
        ["hour", 60 * 60],
        ["day", 24 * 60 * 60],
        ["month", 30 * 24 * 60 * 60],
        ["year", 365 * 24 * 60 * 60],
    ];

    let [unit, seconds] = steps[0];
    for (const [stepUnit, stepSeconds] of steps) {
        if (elapsedSeconds >= stepSeconds) {
            [unit, seconds] = [stepUnit, stepSeconds];
        }
    }

    return formatter.format(-Math.floor(elapsedSeconds / seconds), unit);
}

/** "Sì"/"No" per i campi booleani mostrati come testo (spunte della scheda report, fatturazione). */
export const formatYesNo = (value: boolean) => (value ? "Sì" : "No");

export function formatFileSize(sizeBytes: number) {
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }

    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatEuro(value: number | null | undefined) {
    const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;

    return euroFormatter.format(amount);
}

/** "AAAA-MM-GG" locale (non UTC): la forma che il backend si aspetta per le date-solo-giorno. */
export function formatDateISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * La stessa regola che il browser applica a `type="email"` (è l'espressione dello standard
 * HTML). Con la validazione nativa spenta nei dialoghi (vedi `CustomDialog`), il controllo va
 * fatto a mano, e l'errore risultante va sotto il campo come gli altri. Prima due punti del
 * codice (il cliente e le impostazioni email) avevano ciascuno la propria regex, e quella delle
 * impostazioni email era più permissiva: un indirizzo poteva essere accettato in un form e
 * rifiutato nell'altro.
 */
const emailPattern =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isValidEmail(value: string): boolean {
    return emailPattern.test(value);
}

/**
 * Il tasto che accompagna le scorciatoie, scritto come lo scriverebbe chi sta davanti allo
 * schermo: ⌘ sui Mac, Ctrl altrove. Sta qui perché lo leggono sia la ricerca globale sia
 * l'elenco delle scorciatoie, e due copie del controllo avevano già preso strade diverse.
 */
export const isMacLike = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const modifierKey = isMacLike ? "⌘" : "Ctrl";

/**
 * Il campo facoltativo di un form: la casella vuota diventa `null`, non la stringa "".
 *
 * Le API distinguono i due casi — `null` è "non compilato", `""` sarebbe un valore vero e
 * proprio — e ogni pagina lo riscriveva a mano come
 * `String(values.x).trim() === "" ? null : String(values.x).trim()`, con il `trim` ripetuto
 * due volte e il nome del campo scritto tre.
 */
export function trimOrNull(value: string) {
    return value.trim() || null;
}
