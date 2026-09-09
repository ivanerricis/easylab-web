import type { CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import type { EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import { listCustomers, listDevices, listIssues } from "@/lib/api";
import { resolveSelectedCustomer } from "@/lib/customers";

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
    let customerId = values.customerId;
    let deviceId = values.deviceId;
    let issueId = values.issueId;

    if (customerId == null) {
        const customers = await listCustomers();
        const selectedCustomer = resolveSelectedCustomer(customers, values.customer);

        if (!selectedCustomer) {
            throw new Error("Seleziona un cliente esistente o creane uno nuovo.");
        }

        customerId = selectedCustomer.id;
    }

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
 * I campi del report da mandare a `updateReport`.
 *
 * Le tre pagine da cui si modifica un report — la scheda, l'elenco e la scheda tecnico —
 * costruivano questo stesso oggetto in tre copie identiche: aggiungere un campo voleva dire
 * ricordarsi di tre punti, e dimenticarne uno non rompeva la compilazione, perché nel
 * payload sono tutti facoltativi. La parte sui tecnici resta invece alle pagine: lì le tre
 * non sono uguali.
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
});
