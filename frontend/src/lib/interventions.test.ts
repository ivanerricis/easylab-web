import { afterEach, describe, expect, it, vi } from "vitest";
import {
    formatInterventionStatus,
    formatInterventionTime,
    formatInterventionType,
    getInterventionValidationError,
    getTodayDateString,
    interventionDateLabel,
    interventionDescriptionLabel,
    isOnSiteInterventionType,
} from "./interventions";

type Values = Parameters<typeof getInterventionValidationError>[0];

/** Un intervento in sede completato e valido: ogni test ne rompe un campo solo. */
const validOnSite: Values = {
    type: "intervento_sede",
    status: "completato",
    description: "Sostituito alimentatore",
    interventionDate: "2026-09-11",
    problem: "Il PC non si accende",
    startTime: "09:00",
    endTime: "10:30",
};

const validDelivery: Values = {
    type: "consegna_materiale",
    status: "completato",
    description: "2 risme di carta",
    interventionDate: "2026-09-11",
    problem: "",
    startTime: "",
    endTime: "",
};

afterEach(() => {
    vi.useRealTimers();
});

describe("etichette degli interventi", () => {
    it("traduce tipo e stato, lasciando passare un valore sconosciuto", () => {
        expect(formatInterventionType("intervento_remoto")).toBe("Intervento da remoto");
        expect(formatInterventionStatus("in_lavorazione")).toBe("In lavorazione");
        expect(formatInterventionType("sconosciuto" as never)).toBe("sconosciuto");
    });

    it("distingue le consegne dagli interventi veri e propri", () => {
        expect(isOnSiteInterventionType("intervento_sede")).toBe(true);
        expect(isOnSiteInterventionType("intervento_remoto")).toBe(true);
        expect(isOnSiteInterventionType("consegna_materiale")).toBe(false);

        expect(interventionDescriptionLabel("consegna_materiale")).toBe("Materiali da consegnare");
        expect(interventionDescriptionLabel("intervento_sede")).toBe("Assistenza effettuata");
        expect(interventionDateLabel("consegna_materiale")).toBe("Data consegna");
        expect(interventionDateLabel("intervento_remoto")).toBe("Data intervento");
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
                status: "programmato",
                description: "",
                startTime: "",
                endTime: "",
            })
        ).toBeNull();
    });

    it("chiede comunque il problema anche a un intervento programmato", () => {
        expect(getInterventionValidationError({ ...validOnSite, status: "programmato", problem: "" })).toEqual({
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
                status: "programmato",
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
