import type { CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import type { EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import { listDevices, listIssues, type ReportCreateInput } from "@/lib/api";
import { resolveCustomerId } from "@/lib/customerLookup";
import { trimOrNull } from "@/lib/utils";

export type ResolvedReportReferences = {
    customerId: number;
    deviceId: number;
    issueId: number;
    issueDescription: string | null;
};

/**
 * Traduce quello che il dialogo consegna negli id che l'API richiede.
 *
 * Nel caso normale non fa nessuna richiesta: il dialogo ha già risolto gli id dai cataloghi
 * che ha caricato all'apertura. Le liste qui sotto servono solo quando un id manca, cioè
 * quando il testo digitato non corrisponde a nessuna voce.
 *
 * I tre campi si comportano allo stesso modo: se quello che c'è scritto non esiste in
 * catalogo, il salvataggio si ferma e lo dice. Il difetto faceva eccezione — da una pagina
 * creava la voce da solo, dall'altra ripiegava su "Altro" — e quella differenza non l'aveva
 * decisa nessuno: era nata da due copie della stessa funzione che si erano allontanate.
 * Adesso le voci di catalogo si creano solo di proposito, col pulsante "+" accanto al campo.
 */
export const resolveReportReferences = async (values: CreateReportSubmitValues): Promise<ResolvedReportReferences> => {
    // Il cliente si cerca sul server, non dentro l'elenco intero: vedi `findCustomerByText`.
    const customerId = await resolveCustomerId(values.customerId, values.customer);
    let deviceId = values.deviceId;
    let issueId = values.issueId;

    if (deviceId == null) {
        const devices = await listDevices();
        const selectedDevice = devices.find(
            (device) => device.name.toLowerCase() === values.deviceType.trim().toLowerCase()
        );

        if (!selectedDevice) {
            throw new Error("Seleziona una tipologia dispositivo esistente o creane una nuova.");
        }

        deviceId = selectedDevice.id;
    }

    if (issueId == null) {
        const issues = await listIssues();
        const selectedIssue = issues.find(
            (issue) => issue.description.toLowerCase() === values.issue.trim().toLowerCase()
        );

        if (!selectedIssue) {
            throw new Error("Seleziona un difetto esistente o creane uno nuovo.");
        }

        issueId = selectedIssue.id;
    }

    return { customerId, deviceId, issueId, issueDescription: values.issueDescription };
};

/**
 * I campi del report da mandare a `createReport`, una volta risolti i riferimenti. Stava in tre
 * copie — l'elenco report, la scheda cliente e la Dashboard — come la sua gemella
 * `toInterventionCreatePayload`, con lo stesso rischio: nel payload i campi sono facoltativi, e
 * una copia che dimentica un campo lo perde senza che niente se ne accorga.
 */
export const toReportCreatePayload = (
    values: CreateReportSubmitValues,
    references: ResolvedReportReferences
): ReportCreateInput => ({
    deviceId: references.deviceId,
    issueId: references.issueId,
    customerId: references.customerId,
    note: trimOrNull(values.notes),
    password: trimOrNull(values.password),
    issueDescription: references.issueDescription,
    dataBackup: values.dataBackup,
    charger: values.charger,
});

/**
 * I campi del report da mandare a `updateReport`, tecnico esterno compreso.
 *
 * Le tre pagine da cui si modifica un report — la scheda, l'elenco e la scheda tecnico —
 * costruivano questo stesso oggetto in tre copie identiche: aggiungere un campo voleva dire
 * ricordarsi di tre punti, e dimenticarne uno non rompeva la compilazione, perché nel
 * payload sono tutti facoltativi. Il tecnico ci è entrato il 2026-09-18: prima ogni pagina lo
 * riconciliava da sé con due o tre richieste separate dopo quella del report.
 */
export const toReportUpdatePayload = (values: EditReportSubmitValues) => ({
    customerId: values.customerId,
    deviceId: values.deviceId,
    issueId: values.issueId,
    collaboratorId: values.collaboratorId,
    issueDescription: values.issueDescription,
    serviceDescription: values.serviceDescription,
    note: values.note,
    password: values.password,
    dataBackup: values.dataBackup,
    charger: values.charger,
    alerted: values.alerted,
    closed: values.closed,
    paymentMethod: values.paymentMethod,
    price: values.internalPrice,
    technicianId: values.technicianId,
    technicianPrice: values.technicianId == null ? 0 : values.technicianPrice,
});
