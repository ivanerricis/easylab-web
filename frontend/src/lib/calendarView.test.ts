import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStoredCalendarView, setStoredCalendarView } from "./calendarView";

const setViewportWidth = (width: number) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
};

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    setViewportWidth(1024);
});

describe("calendarView", () => {
    it("ricorda la vista scelta", () => {
        setStoredCalendarView("week");

        expect(getStoredCalendarView()).toBe("week");
    });

    it("senza preferenza usa il mese su schermi larghi e l'agenda su mobile", () => {
        setViewportWidth(1280);
        expect(getStoredCalendarView()).toBe("month");

        setViewportWidth(400);
        expect(getStoredCalendarView()).toBe("agenda");
    });

    it("ignora un valore salvato che non è una vista valida", () => {
        localStorage.setItem("easylab-web-calendar-view", "year");
        setViewportWidth(1280);

        expect(getStoredCalendarView()).toBe("month");
    });
});
