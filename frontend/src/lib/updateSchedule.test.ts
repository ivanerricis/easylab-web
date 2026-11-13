import { describe, expect, it } from "vitest";
import {
    formatScheduledMoment,
    suggestedUpdateSchedule,
    toScheduleFields,
    validateUpdateSchedule,
} from "./updateSchedule";

// Le date si compongono in ora locale, come fa il codice: i test valgono in qualunque fuso.
const local = (month: number, day: number, hours: number, minutes = 0) =>
    new Date(2026, month - 1, day, hours, minutes);

describe("formatScheduledMoment", () => {
    it("scrive giorno della settimana, data e ora", () => {
        expect(formatScheduledMoment(local(11, 12, 3).toISOString())).toBe("giovedì 12/11 alle 03:00");
    });
});

describe("suggestedUpdateSchedule", () => {
    it("propone le 03:00 di stanotte se mancano piu' di cinque minuti", () => {
        expect(suggestedUpdateSchedule(local(11, 12, 21, 30))).toEqual({ date: "2026-11-13", time: "03:00" });
        expect(suggestedUpdateSchedule(local(11, 12, 1, 0))).toEqual({ date: "2026-11-12", time: "03:00" });
    });

    it("dopo le 02:55 passa alla notte successiva", () => {
        expect(suggestedUpdateSchedule(local(11, 12, 2, 58))).toEqual({ date: "2026-11-13", time: "03:00" });
        expect(suggestedUpdateSchedule(local(11, 12, 15, 0))).toEqual({ date: "2026-11-13", time: "03:00" });
    });
});

describe("toScheduleFields", () => {
    it("riporta un istante ai campi data e ora locali", () => {
        expect(toScheduleFields(local(11, 12, 4, 5).toISOString())).toEqual({ date: "2026-11-12", time: "04:05" });
    });
});

describe("validateUpdateSchedule", () => {
    const now = local(11, 12, 12, 0);

    it("accetta un orario futuro entro 30 giorni", () => {
        expect(validateUpdateSchedule({ date: "2026-11-13", time: "03:00" }, now)).toEqual({});
        expect(validateUpdateSchedule({ date: "2026-12-12", time: "11:00" }, now)).toEqual({});
    });

    it("chiede i campi vuoti", () => {
        expect(validateUpdateSchedule({ date: "", time: "" }, now)).toEqual({
            date: "Scegli la data",
            time: "Scegli l'ora",
        });
    });

    it("rifiuta un orario passato o troppo vicino", () => {
        expect(validateUpdateSchedule({ date: "2026-11-12", time: "11:00" }, now).time).toMatch(/futuro/);
        expect(validateUpdateSchedule({ date: "2026-11-12", time: "12:01" }, now).time).toMatch(/futuro/);
    });

    it("rifiuta oltre 30 giorni", () => {
        expect(validateUpdateSchedule({ date: "2026-12-13", time: "12:00" }, now).date).toMatch(/30 giorni/);
    });
});
