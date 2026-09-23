import type { ReportPaymentMethod } from "../db/schema";

/**
 * Le etichette italiane del metodo di pagamento del report, e "Sì"/"No" con l'accento.
 *
 * Stavano duplicate: `reportPaymentMethodLabels` in `routes/reports.ts` (per il CSV) e
 * `formatPaymentMethod` in `reportPdf.ts` (per la ricevuta e i resoconti), con le stesse tre
 * stringhe scritte due volte. Il sì/no aveva lo stesso destino ma al contrario: `reportPdf.ts`
 * scriveva "Si" senza accento, mentre `csv.ts` e `interventionPdf.ts` scrivevano "Sì" — due grafie
 * diverse per la stessa risposta nello stesso resoconto, a seconda di quale file l'avesse scritta.
 * Sul modello di `interventionLabels.ts`: nessuna dipendenza da pdfmake, così chi vuole solo
 * l'etichetta (qui, il CSV) non si porta dietro il generatore di PDF.
 */

const reportPaymentMethodLabels: Record<ReportPaymentMethod, string> = {
    non_paid: "Non pagato",
    cash: "Contanti",
    card: "Carta",
};

export const formatReportPaymentMethod = (value: ReportPaymentMethod) => reportPaymentMethodLabels[value] ?? value;

export const formatYesNo = (value: boolean) => (value ? "Sì" : "No");
