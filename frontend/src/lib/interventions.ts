import type { InterventionStatus, InterventionType } from "@/types/dtos";

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

export const formatInterventionType = (value: InterventionType) =>
    interventionTypeOptions.find((option) => option.value === value)?.label ?? value;

export const formatInterventionStatus = (value: InterventionStatus) =>
    interventionStatusOptions.find((option) => option.value === value)?.label ?? value;

export const isOnSiteInterventionType = (value: InterventionType) =>
    value === "intervento_sede" || value === "intervento_remoto";

export const interventionDescriptionLabel = (value: InterventionType) =>
    value === "consegna_materiale" ? "Materiali da consegnare" : "Assistenza effettuata";

/**
 * Un intervento ancora solo programmato descrive un lavoro non ancora svolto: l'orario esatto
 * e l'assistenza effettuata sono informazioni che nascono quando lo si fa, non quando lo si
 * mette in agenda. Diventano obbligatorie appena lo stato passa a "in lavorazione" o
 * "completato", altrimenti un intervento risulterebbe chiuso senza che risulti cosa è stato
 * fatto.
 *
 * Il problema riscontrato non segue questa regola: è noto fin dalla chiamata del cliente ed è
 * il motivo per cui l'intervento viene programmato.
 */
export const isScheduledInterventionStatus = (value: InterventionStatus) => value === "programmato";

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
    const scheduled = isScheduledInterventionStatus(values.status);
    const isOnSite = isOnSiteInterventionType(values.type);

    if (!scheduled && values.description.trim() === "") {
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
            message: isOnSite ? "Seleziona la data dell'intervento" : "Seleziona la data di consegna",
        };
    }

    if (!isOnSite) {
        return null;
    }

    if (values.problem.trim() === "") {
        return { field: "problem", message: "Indica il problema riscontrato" };
    }

    if (!scheduled && (values.startTime.trim() === "" || values.endTime.trim() === "")) {
        return {
            field: values.startTime.trim() === "" ? "startTime" : "endTime",
            message: "Indica l'ora di inizio e di fine assistenza",
        };
    }

    // Vale anche per un intervento programmato: se gli orari sono stati indicati, devono
    // avere senso fra loro.
    if (values.startTime !== "" && values.endTime !== "" && values.startTime >= values.endTime) {
        return { field: "endTime", message: "L'ora di fine deve essere successiva all'ora di inizio" };
    }

    return null;
};

export const interventionDateLabel = (value: InterventionType) =>
    value === "consegna_materiale" ? "Data consegna" : "Data intervento";

export const formatInterventionTime = (value: string | null) => (value ? value.slice(0, 5) : "-");

export const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};
