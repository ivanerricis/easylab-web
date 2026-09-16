import { describe, expect, it } from "vitest";
import { formatInterventionStatus, formatInterventionType } from "./interventionLabels";

// Le stesse etichette finiscono su PDF, email e CSV: se cambiano, devono cambiare in un posto
// solo, ed è il motivo per cui questo modulo esiste separato da `interventionPdf`.
describe("etichette degli interventi", () => {
    it("mappa ogni tipo nella sua etichetta italiana", () => {
        expect(formatInterventionType("consegna_materiale")).toBe("Consegna materiale");
        expect(formatInterventionType("intervento_sede")).toBe("Intervento in sede");
        expect(formatInterventionType("intervento_remoto")).toBe("Intervento da remoto");
    });

    it("mappa ogni stato nella sua etichetta italiana", () => {
        expect(formatInterventionStatus("programmato")).toBe("Programmato");
        expect(formatInterventionStatus("in_lavorazione")).toBe("In lavorazione");
        expect(formatInterventionStatus("completato")).toBe("Completato");
    });
});
