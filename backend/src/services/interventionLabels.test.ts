import { describe, expect, it } from "vitest";
import { formatInterventionStatus, formatInterventionType } from "./interventionLabels";

// Le stesse etichette finiscono su PDF, email e CSV: se cambiano, devono cambiare in un posto
// solo, ed è il motivo per cui questo modulo esiste separato da `interventionPdf`.
describe("etichette degli interventi", () => {
    it("mappa ogni tipo nella sua etichetta italiana", () => {
        expect(formatInterventionType("material_delivery")).toBe("Consegna materiale");
        expect(formatInterventionType("customer_site")).toBe("Intervento in sede");
        expect(formatInterventionType("remote")).toBe("Intervento da remoto");
    });

    it("mappa ogni stato nella sua etichetta italiana", () => {
        expect(formatInterventionStatus("scheduled")).toBe("Programmato");
        expect(formatInterventionStatus("in_progress")).toBe("In lavorazione");
        expect(formatInterventionStatus("completed")).toBe("Completato");
    });
});
