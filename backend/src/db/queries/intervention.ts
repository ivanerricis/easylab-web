import { and, asc, desc, eq, getTableColumns, inArray, or, sql, type SQL } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { db } from "../index";
import { collaboratorTable, customerTable, interventionTable } from "../schema";
import type { NewIntervention, UpdateIntervention } from "../types";
import { takeUnpaginated, type UnpaginatedLimit } from "./pagination";
import { personName, personNameOrDash } from "./personName";
import { containsText, parseIdSearch } from "./search";
import { onLocalDays, toLocalTimestamp } from "./timeZone";

type InterventionSortBy = "createdAt" | "interventionDate" | "customer" | "status";

type ListInterventionsParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: "all" | "programmato" | "in_lavorazione" | "completato";
    type?: "all" | "consegna_materiale" | "intervento_sede" | "intervento_remoto";
    dateFrom?: string;
    dateTo?: string;
    scheduledDate?: string;
    /** Intervallo sulla data dell'intervento, non su quella di creazione: lo usa il calendario. */
    scheduledFrom?: string;
    scheduledTo?: string;
    customerId?: number;
    collaboratorId?: number;
    sortBy?: InterventionSortBy;
    sortOrder?: "asc" | "desc";
    /** Il fuso in cui leggere i giorni delle date di creazione: vedi `timeZone.ts`. */
    timeZone: string;
    /** Tetto e comportamento senza paginazione: gli export passano `exportRowLimit`. */
    unpaginatedLimit?: UnpaginatedLimit;
};

/**
 * Gli id degli interventi che corrispondono alla ricerca libera: una query per tabella, unite,
 * come `matchingReportIds` in `report.ts` (lì il perché). Misure sul database di sviluppo
 * (8000 interventi, pagina + totale): "stampante" 84 → 50 ms, nessun risultato 140 → 1 ms.
 *
 * Tipo e stato non ci sono: nessuno dei due ha un indice che regga un `ILIKE '%…%'`, e la
 * pagina ha i due menù dedicati (`status` e `type`, confronti esatti più sotto). Problema e
 * note non sono mai stati fra i rami, e non hanno un indice trigram: aggiungerli vuol dire
 * aggiungere prima l'indice.
 */
const matchingInterventionIds = (search: string) => {
    const pattern = `%${search}%`;
    const idSearch = parseIdSearch(search);
    const interventionIds = () => db.select({ id: interventionTable.id }).from(interventionTable);

    return union(
        interventionIds().where(
            or(
                idSearch != null ? eq(interventionTable.id, idSearch) : undefined,
                containsText(interventionTable.description, pattern)
            )
        ),
        interventionIds()
            .innerJoin(customerTable, eq(customerTable.id, interventionTable.customerId))
            .where(
                or(
                    containsText(customerTable.firstName, pattern),
                    containsText(customerTable.lastName, pattern),
                    containsText(customerTable.phoneNumber, pattern),
                    containsText(customerTable.phoneNumberSecondary, pattern)
                )
            ),
        interventionIds()
            .innerJoin(collaboratorTable, eq(collaboratorTable.id, interventionTable.collaboratorId))
            .where(
                or(
                    containsText(collaboratorTable.firstName, pattern),
                    containsText(collaboratorTable.lastName, pattern)
                )
            )
    );
};

export const listInterventions = async ({
    page,
    pageSize,
    search,
    status = "all",
    type = "all",
    dateFrom,
    dateTo,
    scheduledDate,
    scheduledFrom,
    scheduledTo,
    customerId,
    collaboratorId,
    sortBy = "createdAt",
    sortOrder = "desc",
    unpaginatedLimit,
    timeZone,
}: ListInterventionsParams) => {
    const trimmedSearch = search?.trim();
    const searchCondition = trimmedSearch
        ? inArray(interventionTable.id, matchingInterventionIds(trimmedSearch))
        : undefined;
    const statusCondition = status !== "all" ? eq(interventionTable.status, status) : undefined;
    const typeCondition = type !== "all" ? eq(interventionTable.type, type) : undefined;
    const dateCondition = onLocalDays(interventionTable.created_at, { from: dateFrom, to: dateTo }, timeZone);
    const scheduledDateCondition = scheduledDate ? eq(interventionTable.interventionDate, scheduledDate) : undefined;

    /**
     * Intervallo sulla data dell'intervento, per il calendario.
     *
     * Il ramo sui record senza data non è teorico: quelli creati prima dell'introduzione di
     * `intervention_date` ne sono privi, e il calendario li colloca sulla data di creazione
     * (`useCalendarInterventions.toCalendarEvent`). Filtrare qui solo sulla prima colonna li
     * farebbe sparire dal calendario invece di limitarsi a non caricarli fuori intervallo.
     * Scritto come OR di due condizioni e non come `coalesce(...)`: un'espressione calcolata
     * non sarebbe coperta dagli indici, mentre così il pianificatore può usarli entrambi.
     */
    const scheduledRangeBounds =
        scheduledFrom && scheduledTo
            ? { from: scheduledFrom, to: scheduledTo }
            : scheduledFrom
              ? { from: scheduledFrom, to: null }
              : scheduledTo
                ? { from: null, to: scheduledTo }
                : null;
    const inScheduledRange = (column: SQL | typeof interventionTable.interventionDate) =>
        scheduledRangeBounds?.from && scheduledRangeBounds.to
            ? sql`${column} BETWEEN ${scheduledRangeBounds.from} AND ${scheduledRangeBounds.to}`
            : scheduledRangeBounds?.from
              ? sql`${column} >= ${scheduledRangeBounds.from}`
              : sql`${column} <= ${scheduledRangeBounds?.to}`;
    const scheduledRangeCondition = scheduledRangeBounds
        ? or(
              and(
                  sql`${interventionTable.interventionDate} IS NOT NULL`,
                  inScheduledRange(interventionTable.interventionDate)
              ),
              and(
                  sql`${interventionTable.interventionDate} IS NULL`,
                  // Il giorno di creazione nel fuso del laboratorio, come i filtri qui sopra.
                  inScheduledRange(sql`(${toLocalTimestamp(interventionTable.created_at, timeZone)})::date`)
              )
          )
        : undefined;
    const customerCondition = customerId ? eq(interventionTable.customerId, customerId) : undefined;
    const collaboratorCondition = collaboratorId ? eq(interventionTable.collaboratorId, collaboratorId) : undefined;
    const whereConditions = [
        statusCondition,
        typeCondition,
        dateCondition,
        scheduledDateCondition,
        scheduledRangeCondition,
        customerCondition,
        collaboratorCondition,
        searchCondition,
    ].filter((condition): condition is NonNullable<typeof condition> => condition != null);
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const customerSortExpr = personNameOrDash(customerTable.firstName, customerTable.lastName);
    const sortColumn =
        sortBy === "customer"
            ? customerSortExpr
            : sortBy === "interventionDate"
              ? interventionTable.interventionDate
              : sortBy === "status"
                ? interventionTable.status
                : interventionTable.created_at;
    const orderByClause = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const baseQuery = db
        .select({
            id: interventionTable.id,
            type: interventionTable.type,
            description: interventionTable.description,
            // Nell'elenco a schermo non si vede, ma è una delle colonne dell'esportazione CSV,
            // che parte proprio da questa query per avere gli stessi filtri della lista. È un
            // intero: `problem` e `note`, che arrivano a 4000 caratteri, restano invece fuori
            // per non gonfiare ogni pagina dell'elenco con testo che nessuno legge lì.
            price: interventionTable.price,
            paid: interventionTable.paid,
            toInvoice: interventionTable.toInvoice,
            status: interventionTable.status,
            interventionDate: interventionTable.interventionDate,
            startTime: interventionTable.startTime,
            endTime: interventionTable.endTime,
            customerId: interventionTable.customerId,
            collaboratorId: interventionTable.collaboratorId,
            customer: customerSortExpr,
            customerPhone: sql<
                string | null
            >`coalesce(${customerTable.phoneNumber}, ${customerTable.phoneNumberSecondary})`,
            collaborator: personNameOrDash(collaboratorTable.firstName, collaboratorTable.lastName),
            createdAt: interventionTable.created_at,
            updatedAt: interventionTable.updated_at,
        })
        .from(interventionTable)
        .innerJoin(customerTable, eq(customerTable.id, interventionTable.customerId))
        .innerJoin(collaboratorTable, eq(collaboratorTable.id, interventionTable.collaboratorId));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery.where(whereClause).orderBy(orderByClause), "interventions", unpaginatedLimit);
    }

    /**
     * Il totale senza i join, come in `listReports`: `customer_id` e `collaborator_id` sono NOT
     * NULL con chiave esterna, quindi le due inner join non possono né scartare né duplicare
     * righe, e contare `intervention` da sola dà lo stesso numero leggendo una tabella invece di
     * tre. La ricerca guarda solo `intervention.id` (vedi `matchingInterventionIds`).
     */
    const countQuery = db
        .select({ total: sql<number>`count(*)` })
        .from(interventionTable)
        .where(whereClause);

    const [items, totalCountRows] = await Promise.all([
        baseQuery
            .where(whereClause)
            .orderBy(orderByClause)
            .limit(pageSize)
            .offset((page - 1) * pageSize),
        countQuery,
    ]);

    return {
        items,
        totalItems: Number(totalCountRows[0]?.total ?? 0),
    };
};

export const getInterventionStats = async () => {
    const statusCountRows = await db
        .select({ status: interventionTable.status, count: sql<number>`count(*)::int` })
        .from(interventionTable)
        .groupBy(interventionTable.status);

    const countByStatus = new Map(statusCountRows.map((row) => [row.status, Number(row.count)]));

    return {
        programmatoCount: countByStatus.get("programmato") ?? 0,
        inLavorazioneCount: countByStatus.get("in_lavorazione") ?? 0,
        completatoCount: countByStatus.get("completato") ?? 0,
    };
};

export const getInterventionById = (id: number) =>
    db.select().from(interventionTable).where(eq(interventionTable.id, id));

/**
 * L'intervento con il nome e il telefono del cliente e il nome del collaboratore: la pagina di
 * dettaglio li mostra, e prima per trovarli scaricava l'intero elenco dei collaboratori più il
 * cliente con una richiesta a parte.
 *
 * La usano anche la stampa e l'email della ricevuta (`loadInterventionPrintContext`), che prima
 * riscrivevano gli stessi join per conto loro: da lì i due telefoni separati e l'email.
 */
export const getInterventionDetailById = (id: number) =>
    db
        .select({
            ...getTableColumns(interventionTable),
            customerName: personName(customerTable.firstName, customerTable.lastName),
            customerPhone: sql<
                string | null
            >`coalesce(${customerTable.phoneNumber}, ${customerTable.phoneNumberSecondary})`,
            customerPhoneNumber: customerTable.phoneNumber,
            customerPhoneSecondary: customerTable.phoneNumberSecondary,
            customerEmail: customerTable.email,
            collaboratorName: personName(collaboratorTable.firstName, collaboratorTable.lastName),
        })
        .from(interventionTable)
        .innerJoin(customerTable, eq(customerTable.id, interventionTable.customerId))
        .innerJoin(collaboratorTable, eq(collaboratorTable.id, interventionTable.collaboratorId))
        .where(eq(interventionTable.id, id));

export const createIntervention = (data: NewIntervention) => db.insert(interventionTable).values(data).returning();

export const updateInterventionById = (id: number, data: UpdateIntervention) =>
    db.update(interventionTable).set(data).where(eq(interventionTable.id, id)).returning();

export const deleteInterventionById = (id: number) =>
    db.delete(interventionTable).where(eq(interventionTable.id, id)).returning();
