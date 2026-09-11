import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
    },
}));

import { cn, formatDate, formatDateTime, formatEuro, formatFileSize, openPrintWindow, trimOrNull } from "./utils";

beforeEach(() => {
    toastError.mockClear();
});

describe("cn", () => {
    it("unisce le classi e lascia vincere l'ultima classe Tailwind in conflitto", () => {
        const isHidden: boolean = false;

        expect(cn("px-2", isHidden && "hidden", "px-4", ["text-sm"])).toBe("px-4 text-sm");
    });
});

describe("formatDate / formatDateTime", () => {
    it("formatta in italiano", () => {
        const value = new Date(2026, 8, 11, 14, 5).toISOString();

        expect(formatDate(value)).toBe("11/09/2026");
        expect(formatDateTime(value)).toBe("11/09/2026, 14:05");
    });

    it("mostra un trattino per un valore assente o non valido", () => {
        for (const format of [formatDate, formatDateTime]) {
            expect(format(null)).toBe("-");
            expect(format(undefined)).toBe("-");
            expect(format("")).toBe("-");
            expect(format("non è una data")).toBe("-");
        }
    });
});

describe("formatFileSize", () => {
    it("sceglie l'unità di misura in base alla dimensione", () => {
        expect(formatFileSize(512)).toBe("512 B");
        expect(formatFileSize(1536)).toBe("1.5 KB");
        expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    });
});

describe("formatEuro", () => {
    it("formatta in euro con due decimali", () => {
        // Intl separa simbolo e cifra con uno spazio non divisibile. In it-IT il separatore
        // delle migliaia compare solo da cinque cifre in su: 1234,50 è corretto.
        expect(formatEuro(12345.5).replace(/\s/g, " ")).toBe("12.345,50 €");
        expect(formatEuro(1234.5).replace(/\s/g, " ")).toBe("1234,50 €");
    });

    it("tratta un valore assente o non numerico come zero", () => {
        const zero = formatEuro(0);

        expect(formatEuro(null)).toBe(zero);
        expect(formatEuro(undefined)).toBe(zero);
        expect(formatEuro(Number.NaN)).toBe(zero);
    });
});

describe("trimOrNull", () => {
    it("toglie gli spazi e trasforma la casella vuota in null", () => {
        expect(trimOrNull("  Roma ")).toBe("Roma");
        expect(trimOrNull("   ")).toBeNull();
        expect(trimOrNull("")).toBeNull();
    });
});

describe("openPrintWindow", () => {
    it("apre la stampa in una nuova scheda staccata dalla pagina", () => {
        const popup = { opener: window } as unknown as Window;
        const open = vi.spyOn(window, "open").mockReturnValue(popup);

        expect(openPrintWindow("/api/reports/1/print")).toBe(popup);
        expect(open).toHaveBeenCalledWith("/api/reports/1/print", "_blank");
        // Senza, la pagina di stampa potrebbe navigare la scheda dell'app.
        expect(popup.opener).toBeNull();
        expect(toastError).not.toHaveBeenCalled();
    });

    it("avvisa quando il browser blocca il popup", () => {
        vi.spyOn(window, "open").mockReturnValue(null);

        expect(openPrintWindow("/api/reports/1/print")).toBeNull();
        expect(toastError).toHaveBeenCalledWith(expect.stringContaining("Popup bloccato"));
    });
});
