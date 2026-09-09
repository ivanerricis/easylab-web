/**
 * "Altro" è la voce del catalogo difetti che sta per "non rientra in nessuna delle altre".
 *
 * È l'unico caso in cui il report porta con sé la descrizione del problema scritta a mano:
 * con qualunque altra voce l'etichetta del catalogo dice già tutto, e `issueDescription`
 * resta vuoto. Il riconoscimento è sul testo perché il catalogo non ha una colonna che
 * marchi quella voce come speciale — è una tabella che l'utente gestisce dalla pagina
 * Difetti come tutte le altre.
 */
export const catchAllIssueLabel = "Altro";

export const isCatchAllIssue = (description: string | null | undefined) =>
    (description ?? "").trim().toLowerCase() === catchAllIssueLabel.toLowerCase();
