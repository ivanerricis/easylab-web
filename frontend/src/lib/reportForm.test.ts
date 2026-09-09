import { describe, expect, it, vi } from "vitest";
import { isCatchAllIssue } from "./issues";

const listCustomers = vi.fn();
const listDevices = vi.fn();
const listIssues = vi.fn();

vi.mock("@/lib/api", () => ({
    listCustomers: () => listCustomers() as Promise<unknown>,
    listDevices: () => listDevices() as Promise<unknown>,
    listIssues: () => listIssues() as Promise<unknown>,
}));

import { resolveReportReferences, toReportUpdatePayload } from "./reportForm";
import type { CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import type { EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";

const buildCreateValues = (overrides: Partial<CreateReportSubmitValues> = {}): CreateReportSubmitValues => ({
    customer: "Mario Rossi - 333 1234567",
    deviceType: "iPhone 13",
    issue: "Batteria non carica",
    issueDescription: null,
    password: "",
    notes: "",
    charger: true,
    dataBackup: false,
    customerId: 1,
    deviceId: 2,
    issueId: 3,
    ...overrides,
});

describe("isCatchAllIssue", () => {
    /**
     * È il riconoscimento su cui si regge tutta la regola: con "Altro" compare la casella
     * del problema, con qualunque altra voce no. Il catalogo lo gestisce l'utente dalla
     * pagina Difetti, quindi il testo può arrivare con maiuscole o spazi diversi.
     */
    it("riconosce la voce a prescindere da maiuscole e spazi", () => {
        for (const valore of ["Altro", "altro", "ALTRO", "  Altro  "]) {
            expect(isCatchAllIssue(valore), valore).toBe(true);
        }
    });

    it("non scambia per generica una voce che le somiglia", () => {
        for (const valore of ["Altro difetto", "Altri problemi", "", null, undefined]) {
            expect(isCatchAllIssue(valore), String(valore)).toBe(false);
        }
    });
});

describe("resolveReportReferences", () => {
    it("non chiama nessuna API quando il dialogo ha già risolto gli id", async () => {
        const risultato = await resolveReportReferences(buildCreateValues());

        expect(risultato).toEqual({ customerId: 1, deviceId: 2, issueId: 3, issueDescription: null });
        expect(listCustomers).not.toHaveBeenCalled();
        expect(listDevices).not.toHaveBeenCalled();
        expect(listIssues).not.toHaveBeenCalled();
    });

    /**
     * Il difetto si comporta come cliente e dispositivo: se non esiste in catalogo il
     * salvataggio si ferma. Prima da una pagina creava la voce da solo e dall'altra
     * ripiegava su "Altro", e nessuna delle due era una scelta consapevole.
     */
    it("rifiuta un difetto che non esiste in catalogo, senza crearlo", async () => {
        listIssues.mockResolvedValue([{ id: 3, description: "Batteria non carica" }]);

        await expect(
            resolveReportReferences(buildCreateValues({ issueId: null, issue: "Difetto inventato" }))
        ).rejects.toThrow(/difetto esistente/i);
    });

    it("risolve il difetto dal catalogo ignorando le maiuscole", async () => {
        listIssues.mockResolvedValue([{ id: 7, description: "Batteria non carica" }]);

        const risultato = await resolveReportReferences(
            buildCreateValues({ issueId: null, issue: "  batteria NON carica " })
        );

        expect(risultato.issueId).toBe(7);
    });

    it("porta avanti il problema scritto a mano così com'è", async () => {
        const risultato = await resolveReportReferences(
            buildCreateValues({ issue: "Altro", issueDescription: "Si spegne dopo 10 minuti" })
        );

        expect(risultato.issueDescription).toBe("Si spegne dopo 10 minuti");
    });
});

describe("toReportUpdatePayload", () => {
    /**
     * Questo oggetto stava in tre copie identiche, una per ogni pagina da cui si modifica un
     * report, e nel payload dell'API i campi sono tutti facoltativi: dimenticarne uno in una
     * delle copie non rompeva la compilazione, il campo semplicemente non veniva salvato.
     * Il test elenca cosa deve arrivare all'API, `issueDescription` compreso.
     */
    it("porta all'API tutti i campi del report, problema riscontrato incluso", () => {
        const values: EditReportSubmitValues = {
            reportId: 5,
            customerId: 1,
            deviceId: 2,
            issueId: 3,
            collaboratorId: 4,
            technicianId: null,
            existingTechnicianId: null,
            technicianPrice: 0,
            issueDescription: "Si spegne dopo 10 minuti",
            serviceDescription: "Sostituita batteria",
            note: "Richiamare il cliente",
            password: "1234",
            paymentMethod: "cash",
            dataBackup: true,
            charger: false,
            alerted: true,
            closed: true,
            internalPrice: 50,
        };

        expect(toReportUpdatePayload(values)).toEqual({
            customerId: 1,
            deviceId: 2,
            issueId: 3,
            collaboratorId: 4,
            issueDescription: "Si spegne dopo 10 minuti",
            serviceDescription: "Sostituita batteria",
            note: "Richiamare il cliente",
            password: "1234",
            paymentMethod: "cash",
            dataBackup: true,
            charger: false,
            alerted: true,
            closed: true,
            price: 50,
        });
    });
});
