import { describe, expect, it } from "vitest";
import { buildDateRangeLabel, formatDayLabel, formatPhoneLabel, formatScheduleLabel } from "./formatting";

describe("formatDayLabel", () => {
    it("formatta una data solo-giorno senza slittare al giorno precedente", () => {
        // Se l'ora non venisse fissata a mezzanotte locale, "2026-01-01" interpretata come UTC
        // diventerebbe 31 dicembre in un fuso orario più indietro di UTC.
        expect(formatDayLabel("2026-01-01")).toBe("1 gen 2026");
    });
});

describe("buildDateRangeLabel", () => {
    it("costruisce l'etichetta con entrambi gli estremi", () => {
        expect(buildDateRangeLabel("2026-01-01", "2026-01-31")).toBe("Dal 1 gen 2026 al 31 gen 2026");
    });

    it("costruisce l'etichetta con solo la data di inizio", () => {
        expect(buildDateRangeLabel("2026-01-01", undefined)).toBe("Dal 1 gen 2026");
    });

    it("costruisce l'etichetta con solo la data di fine", () => {
        expect(buildDateRangeLabel(undefined, "2026-01-31")).toBe("Fino al 31 gen 2026");
    });

    it("non produce etichetta quando l'intervallo è vuoto", () => {
        expect(buildDateRangeLabel(undefined, undefined)).toBeUndefined();
    });
});

describe("formatPhoneLabel", () => {
    it("unisce due numeri con un trattino", () => {
        expect(formatPhoneLabel("02 1234567", "333 1234567")).toBe("02 1234567 - 333 1234567");
    });

    it("usa il solo numero disponibile", () => {
        expect(formatPhoneLabel("02 1234567", null)).toBe("02 1234567");
        expect(formatPhoneLabel(null, "333 1234567")).toBe("333 1234567");
    });

    it("ignora gli spazi vuoti come se il numero non ci fosse", () => {
        expect(formatPhoneLabel("  ", "333 1234567")).toBe("333 1234567");
    });

    it("torna N/D quando non c'è nessun numero", () => {
        expect(formatPhoneLabel(null, null)).toBe("N/D");
        expect(formatPhoneLabel("  ", undefined)).toBe("N/D");
    });
});

describe("formatScheduleLabel", () => {
    it("torna null senza una data di intervento", () => {
        expect(formatScheduleLabel(null, "09:00:00", "10:00:00")).toBeNull();
    });

    it("aggiunge la fascia oraria troncata ai secondi quando entrambe le ore ci sono", () => {
        expect(formatScheduleLabel("2026-01-01", "09:00:00", "10:30:00")).toBe("1 gen 2026 09:00-10:30");
    });

    it("omette la fascia oraria quando manca un'ora", () => {
        expect(formatScheduleLabel("2026-01-01", "09:00:00", null)).toBe("1 gen 2026");
        expect(formatScheduleLabel("2026-01-01", null, "10:30:00")).toBe("1 gen 2026");
    });
});
