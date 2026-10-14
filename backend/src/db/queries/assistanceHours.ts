import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../index";
import {
    assistanceHoursAlertTable,
    assistanceTable,
    contractTable,
    customerTable,
    interventionTable,
    providerTable,
    type AssistanceAlertKind,
    type InterventionType,
} from "../schema";
import { personName } from "./personName";

/** Il primo giorno del mese `YYYY-MM`, come lo scrive la colonna `month` degli avvisi. */
export const monthStart = (month: string) => `${month}-01`;

/**
 * Le ore svolte, in decimale, di un intervento completato: `end_time - start_time`. Arrotondate
 * a due decimali (un minuto è 0,0167 h) già in SQL, così il totale che si legge è lo stesso
 * che si confronta con le soglie.
 */
const hoursOf = sql`extract(epoch from (${interventionTable.endTime} - ${interventionTable.startTime}))`;

/** Il pacchetto del contratto, o `undefined` se non è un contratto di assistenza. */
export const getAssistancePackage = async (contractId: number) => {
    const [row] = await db
        .select({ assistanceType: assistanceTable.assistanceType, includedHours: assistanceTable.includedHours })
        .from(assistanceTable)
        .where(eq(assistanceTable.contractId, contractId));

    return row;
};

/**
 * Le ore consumate in un mese: solo interventi `completed`, collegati al contratto e di un tipo
 * che il pacchetto consuma. Il mese è quello di `intervention_date`, senza fusi (è un giorno).
 */
export const sumUsedHours = async (contractId: number, types: readonly InterventionType[], month: string) => {
    if (types.length === 0) {
        return 0;
    }

    const start = monthStart(month);
    const [row] = await db
        .select({ hours: sql<number>`round(coalesce(sum(${hoursOf}), 0) / 3600.0, 2)::float8` })
        .from(interventionTable)
        .where(
            and(
                eq(interventionTable.contractId, contractId),
                eq(interventionTable.status, "completed"),
                inArray(interventionTable.type, [...types]),
                sql`${interventionTable.interventionDate} >= ${start}::date`,
                sql`${interventionTable.interventionDate} < (${start}::date + interval '1 month')`
            )
        );

    return Number(row?.hours ?? 0);
};

/** Le ore consumate per ogni mese in cui ce ne sono, come `{ month: "YYYY-MM", usedHours }`. */
export const sumUsedHoursByMonth = async (contractId: number, types: readonly InterventionType[]) => {
    if (types.length === 0) {
        return [];
    }

    const monthKey = sql<string>`to_char(${interventionTable.interventionDate}, 'YYYY-MM')`;
    const rows = await db
        .select({ month: monthKey, hours: sql<number>`round(coalesce(sum(${hoursOf}), 0) / 3600.0, 2)::float8` })
        .from(interventionTable)
        .where(
            and(
                eq(interventionTable.contractId, contractId),
                eq(interventionTable.status, "completed"),
                inArray(interventionTable.type, [...types])
            )
        )
        .groupBy(monthKey)
        .orderBy(sql`${monthKey} desc`);

    return rows.map((row) => ({ month: row.month, usedHours: Number(row.hours) }));
};

/**
 * Registra l'avviso e dice se la riga l'ha scritta questa chiamata. `ON CONFLICT DO NOTHING`
 * più `RETURNING` è ciò che rende l'invio unico anche con due richieste in parallelo: la chiave
 * primaria lascia passare una sola inserzione, e solo chi l'ha fatta manda l'email.
 */
export const insertAlertIfMissing = async (contractId: number, month: string, kind: AssistanceAlertKind) => {
    const inserted = await db
        .insert(assistanceHoursAlertTable)
        .values({ contractId, month: monthStart(month), kind })
        .onConflictDoNothing()
        .returning({ kind: assistanceHoursAlertTable.kind });

    return inserted.length > 0;
};

/** Toglie gli avvisi del mese che la soglia non raggiunge più, così potranno scattare di nuovo. */
export const deleteAlerts = async (contractId: number, month: string, kinds: readonly AssistanceAlertKind[]) => {
    if (kinds.length === 0) {
        return;
    }

    await db
        .delete(assistanceHoursAlertTable)
        .where(
            and(
                eq(assistanceHoursAlertTable.contractId, contractId),
                eq(assistanceHoursAlertTable.month, monthStart(month)),
                inArray(assistanceHoursAlertTable.kind, [...kinds])
            )
        );
};

/** Quello che serve a scrivere l'email al fornitore: dispositivo, cliente e indirizzo di chi la riceve. */
export const getAlertContext = async (contractId: number) => {
    const [row] = await db
        .select({
            device: contractTable.device,
            customerName: personName(customerTable.firstName, customerTable.lastName),
            providerEmail: providerTable.email,
            providerName: providerTable.providerName,
        })
        .from(contractTable)
        .innerJoin(customerTable, eq(customerTable.id, contractTable.customerId))
        .innerJoin(providerTable, eq(providerTable.id, contractTable.providerId))
        .where(eq(contractTable.id, contractId));

    return row;
};
