import type { PaymentMethod } from "@/types/dtos";
import type { StatusColor } from "@/lib/statusColors";

/**
 * Lo stato di un report, come `lib/interventions.ts` lo fa per gli interventi. "Chiuso/Aperto" era
 * scritto in sei punti e `closed ? "green" : "red"` in quattro: chi cambiava l'uno o l'altro
 * doveva ritrovarli tutti.
 */
export const formatReportStatus = (closed: boolean) => (closed ? "Chiuso" : "Aperto");

export const reportStatusColor = (closed: boolean): StatusColor => (closed ? "green" : "red");

/**
 * Le voci del filtro "aperti/chiusi" (più "Tutti i report", che `FilterSelect` aggiunge da sé).
 * Non c'è una colonna con questi valori: derivano dal booleano `closed`. Le usano l'elenco report
 * e le schede di cliente, collaboratore e tecnico, che prima avevano ciascuna la sua copia.
 */
export const reportVisibilityOptions: { value: "open" | "closed"; label: string }[] = [
    { value: "open", label: "Report aperti" },
    { value: "closed", label: "Report chiusi" },
];

/**
 * Le etichette del metodo di pagamento: le usano il selettore dei dialoghi e la scheda del report,
 * che prima ne aveva una copia sua.
 */
export const paymentMethodLabels: Record<PaymentMethod, string> = {
    non_paid: "Non pagato",
    cash: "Contanti",
    card: "Carta",
};
