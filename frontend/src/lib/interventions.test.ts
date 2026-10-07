import { afterEach, describe, expect, it, vi } from "vitest";
import {
    formatInterventionStatus,
    fromLegacyInterventionValue,
    formatInterventionTime,
    formatInterventionType,
    getInterventionValidationError,
    getTodayDateString,
    interventionDateLabel,
    interventionDescriptionLabel,
    isAssistanceInterventionType,
} from "./interventions";

type Values = Parameters<typeof getInterventionValidationError>[0];

/** Un intervento in sede completato e valido: ogni test ne rompe un campo solo. */
const validOnSite: Values = {
    type: "customer_site",
    status: "completed",
    description: "Sostituito alimentatore",
    interventionDate: "2026-09-11",
    problem: "Il PC non si accende",
    startTime: "09:00",
    endTime: "10:30",
};

const validDelivery: Values = {
    type: "material_delivery",
    status: "completed",
    description: "2 risme di carta",
    interventionDate: "2026-09-11",
    problem: "",
    startTime: "",
    endTime: "",
};

afterEach(() => {
    vi.useRealTimers();
});

describe("valori italiani dei vecchi link", () => {
    it.each([
        ["consegna_materiale", "material_delivery"],
        ["intervento_sede", "customer_site"],
        ["intervento_remoto", "remote"],
        ["programmato", "scheduled"],
        ["in_lavorazione", "in_progress"],
        ["completato", "completed"],
    ])("legge %s come %s", (legacy, current) => {
        expect(fromLegacyInterventionValue(legacy)).toBe(current);
    });

    it("lascia passare valori nuovi, sconosciuti e assenti", () => {
        expect(fromLegacyInterventionValue("scheduled")).toBe("scheduled");
        expect(fromLegacyInterventionValue("toString")).toBe("toString");
        expect(fromLegacyInterventionValue(null)).toBeNull();
    });
});

describe("etichette degli interventi", () => {
    it("traduce tipo e stato, lasciando passare un valore sconosciuto", () => {
        expect(formatInterventionType("remote")).toBe("Intervento da remoto");
        expect(formatInterventionStatus("in_progress")).toBe("In lavorazione");
        expect(formatInterventionType("sconosciuto" as never)).toBe("sconosciuto");
    });

    it("distingue le consegne dagli interventi veri e propri", () => {
        expect(isAssistanceInterventionType("customer_site")).toBe(true);
        expect(isAssistanceInterventionType("remote")).toBe(true);
        expect(isAssistanceInterventionType("material_delivery")).toBe(false);

        expect(interventionDescriptionLabel("material_delivery")).toBe("Materiali da consegnare/consegnati");
        expect(interventionDescriptionLabel("customer_site")).toBe("Assistenza effettuata");
        expect(interventionDateLabel("material_delivery")).toBe("Data consegna");
        expect(interventionDateLabel("remote")).toBe("Data intervento");
    });

    it("mostra l'orario senza secondi, o un trattino se manca", () => {
        expect(formatInterventionTime("09:30:00")).toBe("09:30");
        expect(formatInterventionTime(null)).toBe("-");
    });

    it("scrive la data di oggi nel fuso locale, non in UTC", () => {
        // 00:30 del 12 settembre in Italia è ancora l'11 in UTC: toISOString sbaglierebbe.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 12, 0, 30));

        expect(getTodayDateString()).toBe("2026-09-12");
    });
});

describe("getInterventionValidationError", () => {
    it("accetta un intervento completo", () => {
        expect(getInterventionValidationError(validOnSite)).toBeNull();
        expect(getInterventionValidationError(validDelivery)).toBeNull();
    });

    it("chiede la descrizione con il testo adatto al tipo", () => {
        expect(getInterventionValidationError({ ...validOnSite, description: "  " })).toEqual({
            field: "description",
            message: "Indica il tipo di assistenza effettuata",
        });
        expect(getInterventionValidationError({ ...validDelivery, description: "" })).toEqual({
            field: "description",
            message: "Indica i materiali da consegnare",
        });
    });

    /**
     * Un intervento programmato descrive un lavoro non ancora svolto: pretendere l'assistenza
     * effettuata o l'orario renderebbe impossibile metterlo in agenda.
     */
    it("non chiede descrizione né orari a un intervento solo programmato", () => {
        expect(
            getInterventionValidationError({
                ...validOnSite,
                status: "scheduled",
                description: "",
                startTime: "",
                endTime: "",
            })
        ).toBeNull();
    });

    // Il lavoro è ancora in corso: cosa è stato fatto, e fino a quando, si scrive alla fine.
    it("non chiede descrizione né orari a un intervento in lavorazione", () => {
        expect(getInterventionValidationError({ ...validOnSite, status: "in_progress", description: "" })).toBeNull();
        expect(getInterventionValidationError({ ...validDelivery, status: "in_progress", description: "" })).toBeNull();
        expect(
            getInterventionValidationError({
                ...validOnSite,
                status: "in_progress",
                description: "",
                startTime: "",
                endTime: "",
            })
        ).toBeNull();
    });

    it("chiede comunque il problema anche a un intervento programmato", () => {
        expect(getInterventionValidationError({ ...validOnSite, status: "scheduled", problem: "" })).toEqual({
            field: "problem",
            message: "Indica il problema riscontrato",
        });
    });

    it("chiede la data con il testo adatto al tipo", () => {
        expect(getInterventionValidationError({ ...validOnSite, interventionDate: "" })?.message).toBe(
            "Seleziona la data dell'intervento"
        );
        expect(getInterventionValidationError({ ...validDelivery, interventionDate: "" })?.message).toBe(
            "Seleziona la data di consegna"
        );
    });

    it("non chiede problema e orari a una consegna", () => {
        expect(getInterventionValidationError({ ...validDelivery, startTime: "12:00", endTime: "08:00" })).toBeNull();
    });

    it("indica quale orario manca", () => {
        expect(getInterventionValidationError({ ...validOnSite, startTime: "" })).toEqual({
            field: "startTime",
            message: "Indica l'ora di inizio e di fine assistenza",
        });
        expect(getInterventionValidationError({ ...validOnSite, endTime: "" })?.field).toBe("endTime");
    });

    it("rifiuta un orario di fine che non segue l'inizio, anche se programmato", () => {
        const expected = { field: "endTime", message: "L'ora di fine deve essere successiva all'ora di inizio" };

        expect(getInterventionValidationError({ ...validOnSite, endTime: "09:00" })).toEqual(expected);
        expect(
            getInterventionValidationError({
                ...validOnSite,
                status: "scheduled",
                startTime: "11:00",
                endTime: "10:00",
            })
        ).toEqual(expected);
    });

    it("riporta un errore alla volta, nell'ordine dei campi", () => {
        expect(
            getInterventionValidationError({ ...validOnSite, description: "", interventionDate: "", problem: "" })
                ?.field
        ).toBe("description");
    });
});
