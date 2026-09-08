import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "../index";
import { collaboratorTable, customerTable, interventionTable } from "../schema";
import type { NewIntervention, UpdateIntervention } from "../types";
import { takeUnpaginated } from "./pagination";
import { parseIdSearch } from "./search";

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
    sortBy?: InterventionSortBy;
    sortOrder?: "asc" | "desc";
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
    sortBy = "createdAt",
    sortOrder = "desc",
}: ListInterventionsParams) => {
    const trimmedSearch = search?.trim();
    const searchPattern = `%${trimmedSearch ?? ""}%`;
    const idSearch = trimmedSearch ? parseIdSearch(trimmedSearch) : null;
    // Tipo e stato non stanno più fra i rami di ricerca: nessuno dei due ha un indice che
    // regga un `ILIKE '%…%'`, e la pagina interventi ha già i due menù a tendina dedicati
    // (`status` e `type` arrivano qui come parametri e diventano confronti esatti, poche
    // righe più sotto), che filtrano meglio e senza costo.
    const searchConditions = trimmedSearch
        ? [
              ...(idSearch != null ? [eq(interventionTable.id, idSearch)] : []),
              sql`${interventionTable.description}::text ILIKE ${searchPattern}`,
              sql`${customerTable.firstName}::text ILIKE ${searchPattern}`,
              sql`${customerTable.lastName}::text ILIKE ${searchPattern}`,
              sql`${customerTable.phoneNumber}::text ILIKE ${searchPattern}`,
              sql`${customerTable.phoneNumberSecondary}::text ILIKE ${searchPattern}`,
              sql`${collaboratorTable.firstName}::text ILIKE ${searchPattern}`,
              sql`${collaboratorTable.lastName}::text ILIKE ${searchPattern}`,
          ]
        : [];
    const statusCondition = status !== "all" ? eq(interventionTable.status, status) : undefined;
    const typeCondition = type !== "all" ? eq(interventionTable.type, type) : undefined;
    const dateCondition =
        dateFrom && dateTo
            ? sql`${interventionTable.created_at}::date BETWEEN ${dateFrom} AND ${dateTo}`
            : dateFrom
              ? sql`${interventionTable.created_at}::date >= ${dateFrom}`
              : dateTo
                ? sql`${interventionTable.created_at}::date <= ${dateTo}`
                : undefined;
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
                  inScheduledRange(sql`${interventionTable.created_at}::date`)
              )
          )
        : undefined;
    const customerCondition = customerId ? eq(interventionTable.customerId, customerId) : undefined;
    const searchCondition = searchConditions.length > 0 ? or(...searchConditions) : undefined;
    const whereConditions = [
        statusCondition,
        typeCondition,
        dateCondition,
        scheduledDateCondition,
        scheduledRangeCondition,
        customerCondition,
        searchCondition,
    ].filter((condition): condition is NonNullable<typeof condition> => condition != null);
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const customerSortExpr = sql<string>`coalesce(nullif(concat_ws(' ', ${customerTable.firstName}, ${customerTable.lastName}), ''), '-')`;
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
            collaborator: sql<string>`coalesce(nullif(concat_ws(' ', ${collaboratorTable.firstName}, ${collaboratorTable.lastName}), ''), '-')`,
            createdAt: interventionTable.created_at,
            updatedAt: interventionTable.updated_at,
        })
        .from(interventionTable)
        .innerJoin(customerTable, eq(customerTable.id, interventionTable.customerId))
        .innerJoin(collaboratorTable, eq(collaboratorTable.id, interventionTable.collaboratorId));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery.where(whereClause).orderBy(orderByClause), "interventions");
    }

    const [items, totalCountRows] = await Promise.all([
        baseQuery
            .where(whereClause)
            .orderBy(orderByClause)
            .limit(pageSize)
            .offset((page - 1) * pageSize),
        db
            .select({ total: sql<number>`count(*)` })
            .from(interventionTable)
            .innerJoin(customerTable, eq(customerTable.id, interventionTable.customerId))
            .innerJoin(collaboratorTable, eq(collaboratorTable.id, interventionTable.collaboratorId))
            .where(whereClause),
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

export const createIntervention = (data: NewIntervention) => db.insert(interventionTable).values(data).returning();

export const updateInterventionById = (id: number, data: UpdateIntervention) =>
    db
        .update(interventionTable)
        .set({
            ...data,
            updated_at: new Date(),
        })
        .where(eq(interventionTable.id, id))
        .returning();

export const deleteInterventionById = (id: number) =>
    db.delete(interventionTable).where(eq(interventionTable.id, id)).returning();
