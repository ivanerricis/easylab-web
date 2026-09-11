import { describe, expect, it } from "vitest";
import { toInterventionCreatePayload, toInterventionUpdatePayload } from "./interventionForm";

const shared = {
    type: "intervento_sede" as const,
    status: "completato" as const,
    description: "Sostituito cavo",
    problem: "Rete assente",
    note: "Richiamare lunedì",
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
