import type { CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import { createIssue, listCustomers, listDevices, listIssues } from "@/lib/api";
import { resolveSelectedCustomer } from "@/lib/customers";

/**
 * Cosa fare quando il difetto scritto non corrisponde a nessuna voce del catalogo.
 *
 * Le due pagine da cui si crea un report si comportavano diversamente, ed è una differenza
 * che nessuno ha deciso: è nata da due copie della stessa funzione che si sono allontanate.
 * Qui resta, ma con un nome, in un posto solo e visibile — così è una scelta e non un caso.
 *
 * - `"create"`: il difetto scritto entra nel catalogo (comportamento della pagina Report).
 * - `"fallbackToAltro"`: il catalogo non si tocca e il report punta alla voce "Altro"; la
 *   descrizione scritta resta comunque sul report, nel suo campo di testo libero
 *   (comportamento della Dashboard).
 */
export type UnknownIssueStrategy = "create" | "fallbackToAltro";

export type ResolvedReportReferences = {
    customerId: number;
    deviceId: number;
    issueId: number;
    issueDescription: string;
};

/**
 * Traduce quello che il dialogo consegna negli id che l'API richiede.
 *
 * Nel caso normale non fa nessuna richiesta: il dialogo ha già risolto gli id dai cataloghi
 * che ha caricato all'apertura. Le liste qui sotto servono solo quando un id manca, cioè
 * quando il testo digitato non corrisponde a nessuna voce.
 */
export const resolveReportReferences = async (
    values: CreateReportSubmitValues,
    { unknownIssue }: { unknownIssue: UnknownIssueStrategy }
): Promise<ResolvedReportReferences> => {
    const issueDescription = values.issueDescription.trim();

    if (issueDescription === "") {
        throw new Error("La descrizione difetto e obbligatoria.");
    }

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
        let selectedIssue = issues.find((issue) => issue.description.toLowerCase() === issueDescription.toLowerCase());

        if (!selectedIssue && unknownIssue === "create") {
            try {
                selectedIssue = await createIssue({ description: issueDescription });
            } catch {
                // Un altro utente può averlo creato nel frattempo: la lista aggiornata lo
                // trova, e l'errore di duplicato non deve fermare la creazione del report.
                const refreshedIssues = await listIssues();
                selectedIssue = refreshedIssues.find(
                    (issue) => issue.description.toLowerCase() === issueDescription.toLowerCase()
                );
            }
        }

        if (!selectedIssue && unknownIssue === "fallbackToAltro") {
            selectedIssue = issues.find((issue) => issue.description.toLowerCase() === "altro");

            if (!selectedIssue) {
                try {
                    selectedIssue = await createIssue({ description: "Altro" });
                } catch {
                    const refreshedIssues = await listIssues();
                    selectedIssue = refreshedIssues.find((issue) => issue.description.toLowerCase() === "altro");
                }
            }
        }

        if (!selectedIssue) {
            throw new Error("Impossibile risolvere il difetto di riferimento.");
        }

        issueId = selectedIssue.id;
    }

    return { customerId, deviceId, issueId, issueDescription };
};
