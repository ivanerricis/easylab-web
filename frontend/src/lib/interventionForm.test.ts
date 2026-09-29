import { describe, expect, it, vi } from "vitest";

const createIntervention = vi.fn();
const resolveCustomerId = vi.fn();

vi.mock("@/lib/api", () => ({
    createIntervention: (payload: unknown) => createIntervention(payload) as Promise<unknown>,
}));

vi.mock("@/lib/customerLookup", () => ({
    resolveCustomerId: (...args: unknown[]) => resolveCustomerId(...args) as Promise<unknown>,
}));

import {
    emptyInterventionFormState,
    submitNewIntervention,
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

    /** Prima "12,50" arrivava vuoto dal campo numerico e si salvava come nessun prezzo. */
    it("legge il prezzo con la virgola e segnala quello illeggibile invece di scartarlo", () => {
        expect(validateInterventionForm({ ...filled, price: "12,50" })).toEqual({});
        expect(toInterventionSubmitFields({ ...filled, price: "12,50" }).price).toBe(12.5);
        expect(validateInterventionForm({ ...filled, price: "12,5 euro" })).toEqual({ price: "Importo non valido" });
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

describe("submitNewIntervention", () => {
    /** Il cliente si prende dai valori del dialogo, anche quando è solo testo digitato. */
    it("risolve il cliente dal dialogo e crea l'intervento con tutti i campi", async () => {
        resolveCustomerId.mockResolvedValue(30);
        createIntervention.mockResolvedValue({ id: 77 });

        const creato = await submitNewIntervention({ ...shared, customer: "Mario Rossi - 333", customerId: null });

        expect(creato).toEqual({ id: 77 });
        expect(resolveCustomerId).toHaveBeenCalledWith(null, "Mario Rossi - 333");
        expect(createIntervention).toHaveBeenCalledWith({ ...shared, customerId: 30 });
    });

    it("se il cliente non si risolve non crea niente e lascia l'errore al dialogo", async () => {
        createIntervention.mockClear();
        resolveCustomerId.mockRejectedValue(new Error("Seleziona un cliente esistente o creane uno nuovo."));

        await expect(submitNewIntervention({ ...shared, customer: "Nessuno", customerId: null })).rejects.toThrow(
            /cliente esistente/
        );
        expect(createIntervention).not.toHaveBeenCalled();
    });
});
