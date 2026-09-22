import { sql, type SQLWrapper } from "drizzle-orm";

/**
 * "Nome Cognome" di cliente, collaboratore o tecnico, o null se mancano entrambi (il cognome è
 * facoltativo). Una sola regola per liste, schede, stampe e ordinamento per cliente: prima la stessa
 * `concat_ws` era riscritta a mano in sei punti di `report.ts` e `intervention.ts`.
 */
export const personName = (firstName: SQLWrapper, lastName: SQLWrapper) =>
    sql<string | null>`nullif(concat_ws(' ', ${firstName}, ${lastName}), '')`;

/** Come `personName`, ma con "-" al posto del vuoto: la forma delle colonne delle liste. */
export const personNameOrDash = (firstName: SQLWrapper, lastName: SQLWrapper) =>
    sql<string>`coalesce(${personName(firstName, lastName)}, '-')`;

/** Come `personName`, in JS: per chi ha già la riga in mano e non serve una query. */
export const personDisplayName = (firstName: string, lastName: string | null | undefined) =>
    lastName ? `${firstName} ${lastName}` : firstName;
