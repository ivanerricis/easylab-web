import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import type { CreateInterventionSubmitValues } from "@/components/dialogs/create/createInterventionDialog";
import { getInterventionPrintUrl, getReportPrintUrl } from "@/lib/api";
import { showCreatedToast } from "@/lib/createdToast";
import { entityPaths } from "@/lib/entityPaths";
import { submitNewIntervention } from "@/lib/interventionForm";
import { submitNewReport } from "@/lib/reportForm";
import { openPrintWindow } from "@/lib/utils";

/**
 * Cosa fare dopo la creazione, prima dell'avviso: di solito ricaricare quello che la pagina
 * mostra. L'avviso arriva solo dopo, così "Apri" porta a un elenco che la riga nuova ce l'ha già.
 */
type AfterCreate = () => Promise<unknown>;

/**
 * Il giro completo di "Nuovo report": crea, ricarica, e l'avviso con "Apri" e "Stampa".
 *
 * Stava copiato, riga per riga, nell'elenco report, nella scheda cliente e nella Dashboard; ogni
 * pagina ora dice solo cosa ricaricare. Niente try/catch: l'errore arriva al dialogo, che lo
 * mostra e resta aperto (prima alcune pagine lo mostravano anche loro, e compariva due volte).
 *
 * La funzione restituita cambia solo se cambia `afterCreate`: la Dashboard la passa al
 * calendario, che è in `memo`, e le basta passare un `afterCreate` stabile.
 */
export const useCreateReportFlow = (afterCreate: AfterCreate) => {
    const navigate = useNavigate();

    return useCallback(
        async (values: CreateReportSubmitValues) => {
            const createdReport = await submitNewReport(values);

            await afterCreate();

            showCreatedToast({
                message: `Report #${createdReport.id} creato`,
                onOpen: () => navigate(entityPaths.report(createdReport.id)),
                onPrint: () => openPrintWindow(getReportPrintUrl(createdReport.id)),
            });
        },
        [afterCreate, navigate]
    );
};

/** Lo stesso giro per "Nuovo intervento": vedi `useCreateReportFlow`. */
export const useCreateInterventionFlow = (afterCreate: AfterCreate) => {
    const navigate = useNavigate();

    return useCallback(
        async (values: CreateInterventionSubmitValues) => {
            const createdIntervention = await submitNewIntervention(values);

            await afterCreate();

            showCreatedToast({
                message: `Intervento #${createdIntervention.id} creato`,
                onOpen: () => navigate(entityPaths.intervention(createdIntervention.id)),
                onPrint: () => openPrintWindow(getInterventionPrintUrl(createdIntervention.id)),
            });
        },
        [afterCreate, navigate]
    );
};
