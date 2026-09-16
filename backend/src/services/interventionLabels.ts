/**
 * Le etichette italiane di tipo e stato di un intervento.
 *
 * Stavano in `interventionPdf.ts`, che per servirle trascina dentro pdfmake: chi voleva solo
 * il nome di un tipo — l'email dell'intervento, l'esportazione CSV — si portava dietro il
 * generatore di PDF, e i test dei due si sono ritrovati a dover mockare `interventionPdf`
 * per non pagarne l'import. Qui non c'è nessuna dipendenza, e la mappa resta una sola per
 * PDF, email e CSV.
 */

export type InterventionType = "consegna_materiale" | "intervento_sede" | "intervento_remoto";
export type InterventionStatus = "programmato" | "in_lavorazione" | "completato";

export const formatInterventionType = (value: InterventionType) => {
    if (value === "consegna_materiale") {
        return "Consegna materiale";
    }

    if (value === "intervento_sede") {
        return "Intervento in sede";
    }

    return "Intervento da remoto";
};

const interventionStatusLabels: Record<InterventionStatus, string> = {
    programmato: "Programmato",
    in_lavorazione: "In lavorazione",
    completato: "Completato",
};

export const formatInterventionStatus = (value: InterventionStatus) => interventionStatusLabels[value] ?? value;
