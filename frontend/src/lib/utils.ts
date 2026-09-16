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

export function formatDateTime(value: string | null | undefined) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatDate(value: string | null | undefined) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
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

    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

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
