import { describe, expect, it } from "vitest";
import {
    emptyInterventionFormState,
    toInterventionCreatePayload,
    toInterventionSubmitFields,
    toInterventionUpdatePayload,
    validateInterventionForm,
} from "./interventionForm";

const shared = {
    type: "intervento_sede" as const,
    status: "completato" as const,
    description: "Sostituito cavo",
    problem: "Rete assente",
    note: "Richiamare lunedì",
    price: 80,
    paid: true,
    toInvoice: false,
    collaboratorId: 40,
    interventionDate: "2026-09-10",
    startTime: "09:00",
    endTime: "10:15",
};

describe("interventionForm", () => {
    /**
     * La nota era il campo che le pagine dimenticavano: il dialogo la raccoglieva e il
     * salvataggio non la mandava. Qui si verifica che ogni campo del dialogo arrivi all'API.
     */
    it("in creazione passa tutti i campi del dialogo, nota compresa, con il cliente risolto", () => {
        expect(toInterventionCreatePayload({ ...shared, customer: "Mario Rossi - 333", customerId: null }, 30)).toEqual(
            { ...shared, customerId: 30 }
        );
    });

    it("in modifica passa tutti i campi del dialogo, nota compresa", () => {
        expect(toInterventionUpdatePayload({ ...shared, interventionId: 9 })).toEqual(shared);
    });

    it("una nota tolta arriva come null, così il server la cancella", () => {
        expect(toInterventionUpdatePayload({ ...shared, interventionId: 9, note: null }).note).toBeNull();
    });
});

/** Il modulo condiviso dai dialoghi di creazione e modifica dell'intervento. */
describe("validateInterventionForm / toInterventionSubmitFields", () => {
    const filled = {
        ...emptyInterventionFormState("2026-09-10"),
        type: "intervento_sede" as const,
        status: "completato" as const,
        description: "  Sostituito cavo  ",
        problem: "Rete assente",
        collaboratorId: "40",
        startTime: "09:00",
        endTime: "10:15",
        price: "80",
    };

    it("un modulo completo non ha errori", () => {
        expect(validateInterventionForm(filled)).toEqual({});
    });

    it("dà tutti gli errori insieme, ciascuno sul suo campo", () => {
        expect(validateInterventionForm({ ...filled, collaboratorId: "", price: "-5", problem: "" })).toEqual({
            collaboratorId: "Seleziona un collaboratore",
            price: "Il prezzo deve essere maggiore o uguale a zero",
            problem: "Indica il problema riscontrato",
        });
    });

    it("converte i campi di testo e toglie problema e orari a una consegna materiale", () => {
        expect(toInterventionSubmitFields(filled)).toMatchObject({
            description: "Sostituito cavo",
            price: 80,
            collaboratorId: 40,
            startTime: "09:00",
        });
        expect(toInterventionSubmitFields({ ...filled, type: "consegna_materiale", price: "" })).toMatchObject({
            problem: null,
            startTime: null,
            endTime: null,
            price: null,
        });
    });
});
