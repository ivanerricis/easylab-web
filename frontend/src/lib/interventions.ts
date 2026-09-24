import type { InterventionStatus, InterventionType } from "@/types/dtos";
import { formatDateISO, formatYesNo } from "@/lib/utils";
import type { StatusColor } from "@/lib/statusColors";

export const interventionTypeOptions: { value: InterventionType; label: string }[] = [
    { value: "consegna_materiale", label: "Consegna materiale" },
    { value: "intervento_sede", label: "Intervento in sede" },
    { value: "intervento_remoto", label: "Intervento da remoto" },
];

export const interventionStatusOptions: { value: InterventionStatus; label: string }[] = [
    { value: "programmato", label: "Programmato" },
    { value: "in_lavorazione", label: "In lavorazione" },
    { value: "completato", label: "Completato" },
];

/**
 * Colore di stato della riga: lo legge `index.css` da `data-status-color`, insieme
 * all'intensità scelta in Impostazioni > Tema.
 *
 * Sta qui e non accanto alla tabella perché le liste che mostrano interventi sono ormai tre
 * (elenco interventi, interventi del cliente, scheda del collaboratore) e la mappa era
 * ricopiata in ognuna: tre occasioni perché un colore cambi in un posto solo.
 */
export const interventionStatusColor: Record<InterventionStatus, StatusColor> = {
    programmato: "red",
    in_lavorazione: "yellow",
    completato: "green",
};

export const formatInterventionType = (value: InterventionType) =>
    interventionTypeOptions.find((option) => option.value === value)?.label ?? value;

export const formatInterventionStatus = (value: InterventionStatus) =>
    interventionStatusOptions.find((option) => option.value === value)?.label ?? value;

/**
 * Un intervento di assistenza, in sede o da remoto, contrapposto alla consegna di materiale: è
 * l'assistenza ad avere orari e un problema da descrivere. Si chiamava `isOnSiteInterventionType`,
 * ma valeva anche per gli interventi da remoto e il nome faceva pensare a un errore.
 */
export const isAssistanceInterventionType = (value: InterventionType) =>
    value === "intervento_sede" || value === "intervento_remoto";

export const interventionDescriptionLabel = (value: InterventionType) =>
    value === "consegna_materiale" ? "Materiali da consegnare" : "Assistenza effettuata";

/**
 * Orari e assistenza effettuata sono i dati del lavoro svolto: nascono mentre lo si fa e si
 * completano alla fine, quindi sono obbligatori solo a intervento "completato". Prima lo
 * diventavano già a "in lavorazione", e chi apriva il lavoro doveva inventarsi un orario di
 * fine e una descrizione di ciò che non aveva ancora fatto. A "completato" restano
 * obbligatori: un intervento chiuso deve dire cosa è stato fatto e quando.
 *
 * Il problema riscontrato non segue questa regola: è noto fin dalla chiamata del cliente ed è
 * il motivo per cui l'intervento viene programmato.
 */
export const isCompletedInterventionStatus = (value: InterventionStatus) => value === "completato";

type InterventionFormValues = {
    type: InterventionType;
    status: InterventionStatus;
    description: string;
    interventionDate: string;
    problem: string;
    startTime: string;
    endTime: string;
};

/** I campi dell'intervento che possono risultare invalidi, cioè avere un errore accanto. */
export type InterventionField = "description" | "interventionDate" | "problem" | "startTime" | "endTime";

export type InterventionValidationError = {
    /** Su quale campo va mostrato il messaggio. */
    field: InterventionField;
    message: string;
};

/**
 * Primo errore per i campi comuni ai dialoghi di creazione e modifica, o `null` se sono
 * validi. Vive qui perché le due finestre applicavano la stessa regola ciascuna per conto
 * proprio, ed è comportamento: due copie sono due occasioni perché una cambi da sola.
 * Il server riapplica gli stessi controlli, questo serve a dirlo prima e in italiano.
 *
 * Restituisce il campo insieme al messaggio: prima tornava solo la stringa, che i dialoghi
 * potevano soltanto mostrare in un toast — un avviso staccato dal campo che lo riguardava, su
 * un form da dieci campi in cui "Indica il problema riscontrato" non dice dove sia il
 * problema. Con il campo, lo stesso messaggio va sotto il controllo giusto e il focus può
 * andarci sopra.
 */
export const getInterventionValidationError = (values: InterventionFormValues): InterventionValidationError | null => {
    const completed = isCompletedInterventionStatus(values.status);
    const isAssistance = isAssistanceInterventionType(values.type);

    if (completed && values.description.trim() === "") {
        return {
            field: "description",
            message:
                values.type === "consegna_materiale"
                    ? "Indica i materiali da consegnare"
                    : "Indica il tipo di assistenza effettuata",
        };
    }

    if (values.interventionDate.trim() === "") {
        return {
            field: "interventionDate",
            message: isAssistance ? "Seleziona la data dell'intervento" : "Seleziona la data di consegna",
        };
    }

    if (!isAssistance) {
        return null;
    }

    if (values.problem.trim() === "") {
        return { field: "problem", message: "Indica il problema riscontrato" };
    }

    if (completed && (values.startTime.trim() === "" || values.endTime.trim() === "")) {
        return {
            field: values.startTime.trim() === "" ? "startTime" : "endTime",
            message: "Indica l'ora di inizio e di fine assistenza",
        };
    }

    // Vale anche quando non sono obbligatori: se gli orari sono stati indicati, devono
    // avere senso fra loro.
    if (values.startTime !== "" && values.endTime !== "" && values.startTime >= values.endTime) {
        return { field: "endTime", message: "L'ora di fine deve essere successiva all'ora di inizio" };
    }

    return null;
};

export const interventionDateLabel = (value: InterventionType) =>
    value === "consegna_materiale" ? "Data consegna" : "Data intervento";

export const formatInterventionTime = (value: string | null) => (value ? value.slice(0, 5) : "-");

export const formatPaidStatus = (value: boolean) => (value ? "Pagato" : "Non pagato");

export const formatToInvoiceStatus = formatYesNo;

export const getTodayDateString = () => formatDateISO(new Date());
