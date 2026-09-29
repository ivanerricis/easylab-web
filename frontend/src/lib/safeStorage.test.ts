import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredCalendarView, setStoredCalendarView } from "./calendarView";
import { safeStorage } from "./safeStorage";
import {
    getStoredHiddenColumns,
    getStoredKeyboardShortcutsEnabled,
    getStoredPreference,
    getStoredTableRowsPerPage,
    setStoredKeyboardShortcutsEnabled,
    setStoredPreference,
    setStoredTableColumnWidths,
} from "./theme";
import { blockLocalStorage } from "@/test/blockLocalStorage";

beforeEach(() => {
    localStorage.clear();
});

describe("safeStorage", () => {
    it("legge, scrive e toglie come localStorage quando è disponibile", () => {
        safeStorage.set("chiave", "valore");
        expect(localStorage.getItem("chiave")).toBe("valore");
        expect(safeStorage.get("chiave")).toBe("valore");

        safeStorage.remove("chiave");
        expect(safeStorage.get("chiave")).toBeNull();
    });

    describe("con i dati del sito bloccati", () => {
        let restore: () => void;

        beforeEach(() => {
            restore = blockLocalStorage();
        });

        afterEach(() => {
            restore();
        });

        it("non lancia: la lettura dà null, scrittura e rimozione non fanno niente", () => {
            expect(() => window.localStorage).toThrow();
            expect(safeStorage.get("chiave")).toBeNull();
            expect(() => safeStorage.set("chiave", "valore")).not.toThrow();
            expect(() => safeStorage.remove("chiave")).not.toThrow();
        });

        it("le preferenze tornano ai valori predefiniti invece di lanciare", () => {
            expect(getStoredPreference("accent")).toBeNull();
            expect(getStoredPreference("fontSize")).toBeNull();
            expect(getStoredTableRowsPerPage("reports")).toBe(10);
            expect(getStoredHiddenColumns("reports")).toEqual([]);
            expect(getStoredKeyboardShortcutsEnabled()).toBe(true);
            expect(getStoredCalendarView()).toBeTruthy();

            expect(() => {
                setStoredPreference("accent", "ocean");
                setStoredPreference("fontSize", "lg");
                setStoredTableColumnWidths("reports", { id: 80 });
                setStoredKeyboardShortcutsEnabled(false);
                setStoredCalendarView("week");
            }).not.toThrow();
        });
    });

    it("una scrittura oltre la quota non lancia", () => {
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("Quota superata", "QuotaExceededError");
        });

        try {
            expect(() => safeStorage.set("chiave", "valore")).not.toThrow();
        } finally {
            setItem.mockRestore();
        }
    });
});
