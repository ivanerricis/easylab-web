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
