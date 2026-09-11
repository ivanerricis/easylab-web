import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../index";
import {
    collaboratorTable,
    customerTable,
    deviceTable,
    IssueTable,
    reportTable,
    reportTechnicianTable,
} from "../schema";
import type { NewReport, UpdateReport } from "../types";
import { takeUnpaginated } from "./pagination";
import { parseIdSearch } from "./search";

type ReportSortBy = "createdAt" | "customer" | "totalPrice";

type ListReportsParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    visibility?: "all" | "open" | "closed";
    dateFrom?: string;
    dateTo?: string;
    customerId?: number;
    collaboratorId?: number;
    /** I report affidati a un tecnico esterno: li elenca la sua scheda. */
    technicianId?: number;
    sortBy?: ReportSortBy;
    sortOrder?: "asc" | "desc";
};

export const listReports = async ({
    page,
    pageSize,
    search,
    visibility = "all",
    dateFrom,
    dateTo,
    customerId,
    collaboratorId,
    technicianId,
    sortBy = "createdAt",
    sortOrder = "desc",
}: ListReportsParams) => {
    const trimmedSearch = search?.trim();
    const searchPattern = `%${trimmedSearch ?? ""}%`;
    const idSearch = trimmedSearch ? parseIdSearch(trimmedSearch) : null;
    // Solo colonne di testo, più il numero del report come confronto esatto: vedi `search.ts`
    // per il perché le colonne non testuali sono state tolte. Data, stato e metodo di
    // pagamento restano cercabili dai filtri dedicati sopra la tabella, dove peraltro
    // funzionano davvero (la casella confrontava `cash`, non "contanti").
    const searchConditions = trimmedSearch
        ? [
              ...(idSearch != null ? [eq(reportTable.id, idSearch)] : []),
              sql`${reportTable.note}::text ILIKE ${searchPattern}`,
              sql`${reportTable.password}::text ILIKE ${searchPattern}`,
              sql`${reportTable.issueDescription}::text ILIKE ${searchPattern}`,
              sql`${reportTable.serviceDescription}::text ILIKE ${searchPattern}`,
              sql`${customerTable.firstName}::text ILIKE ${searchPattern}`,
              sql`${customerTable.lastName}::text ILIKE ${searchPattern}`,
              sql`${customerTable.phoneNumber}::text ILIKE ${searchPattern}`,
              sql`${customerTable.phoneNumberSecondary}::text ILIKE ${searchPattern}`,
              sql`${customerTable.email}::text ILIKE ${searchPattern}`,
              sql`${deviceTable.name}::text ILIKE ${searchPattern}`,
              sql`${IssueTable.description}::text ILIKE ${searchPattern}`,
              sql`${collaboratorTable.firstName}::text ILIKE ${searchPattern}`,
              sql`${collaboratorTable.lastName}::text ILIKE ${searchPattern}`,
              sql`${collaboratorTable.phoneNumber}::text ILIKE ${searchPattern}`,
          ]
        : [];
    const visibilityCondition =
        visibility === "open"
            ? eq(reportTable.closed, false)
            : visibility === "closed"
              ? eq(reportTable.closed, true)
              : undefined;
    const dateCondition =
        dateFrom && dateTo
            ? sql`${reportTable.created_at}::date BETWEEN ${dateFrom} AND ${dateTo}`
            : dateFrom
              ? sql`${reportTable.created_at}::date >= ${dateFrom}`
              : dateTo
                ? sql`${reportTable.created_at}::date <= ${dateTo}`
                : undefined;
    const customerCondition = customerId ? eq(reportTable.customerId, customerId) : undefined;
    const collaboratorCondition = collaboratorId ? eq(reportTable.collaboratorId, collaboratorId) : undefined;
    // Sottoquery e non condizione sul join qui sotto: il conteggio della paginazione non porta
    // con sé i join (vedi il commento su `countSelect`), quindi una condizione su
    // `report_technician` lì non avrebbe la tabella a cui riferirsi.
    const technicianCondition = technicianId
        ? inArray(
              reportTable.id,
              db
                  .select({ reportId: reportTechnicianTable.reportId })
                  .from(reportTechnicianTable)
                  .where(eq(reportTechnicianTable.technicianId, technicianId))
          )
        : undefined;
    const searchCondition = searchConditions.length > 0 ? or(...searchConditions) : undefined;
    const whereConditions = [
        visibilityCondition,
        dateCondition,
        customerCondition,
        collaboratorCondition,
        technicianCondition,
        searchCondition,
    ].filter((condition): condition is NonNullable<typeof condition> => condition != null);
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const customerSortExpr = sql<string>`coalesce(nullif(concat_ws(' ', ${customerTable.firstName}, ${customerTable.lastName}), ''), '-')`;
    const totalPriceSortExpr = sql<number>`(${reportTable.price} + coalesce(${reportTechnicianTable.price}, 0))`;
    const sortColumn =
        sortBy === "customer"
            ? customerSortExpr
            : sortBy === "totalPrice"
              ? totalPriceSortExpr
              : reportTable.created_at;
    const orderByClause = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const baseQuery = db
        .select({
            id: reportTable.id,
            customerId: reportTable.customerId,
            deviceId: reportTable.deviceId,
            issueId: reportTable.issueId,
            collaboratorId: reportTable.collaboratorId,
            note: reportTable.note,
            password: reportTable.password,
            issueDescription: reportTable.issueDescription,
            serviceDescription: reportTable.serviceDescription,
            dataBackup: reportTable.dataBackup,
            charger: reportTable.charger,
            alerted: reportTable.alerted,
            paymentMethod: reportTable.paymentMethod,
            price: reportTable.price,
            customer: customerSortExpr,
            customerPhone: sql<
                string | null
            >`coalesce(${customerTable.phoneNumber}, ${customerTable.phoneNumberSecondary})`,
            device: deviceTable.name,
            issue: IssueTable.description,
            technician: sql<string>`coalesce(nullif(concat_ws(' ', ${collaboratorTable.firstName}, ${collaboratorTable.lastName}), ''), '-')`,
            internalPrice: reportTable.price,
            technicianPrice: sql<number>`coalesce(${reportTechnicianTable.price}, 0)::int`,
            totalPrice: sql<number>`${totalPriceSortExpr}::int`,
            closed: reportTable.closed,
            createdAt: reportTable.created_at,
            updatedAt: reportTable.updated_at,
        })
        .from(reportTable)
        .innerJoin(customerTable, eq(customerTable.id, reportTable.customerId))
        .innerJoin(deviceTable, eq(deviceTable.id, reportTable.deviceId))
        .innerJoin(IssueTable, eq(IssueTable.id, reportTable.issueId))
        .leftJoin(collaboratorTable, eq(collaboratorTable.id, reportTable.collaboratorId))
        /**
         * Il compenso del tecnico si legge con un join diretto sulla chiave primaria di
         * `report_technician`, che dalla migration 0004 è il solo `report_id`: un report ha
         * al massimo una riga qui, quindi non c'è niente da sommare e questo join non può
         * moltiplicare le righe. Prima al suo posto c'era una sottoquery con
         * `GROUP BY report_id`, che per restituire le 10 righe di una pagina aggregava
         * l'intera tabella e poi ne buttava via decine di migliaia.
         *
         * Se un giorno tornassero più tecnici per report, la primary key tornerebbe
         * composta e questo join andrebbe rifatto sottoquery con `sum(price)`.
         */
        .leftJoin(reportTechnicianTable, eq(reportTechnicianTable.reportId, reportTable.id));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery.where(whereClause).orderBy(orderByClause), "reports");
    }

    /**
     * Il totale non porta con sé i join delle righe.
     *
     * Le colonne unite servono a *mostrare* un report (nome cliente, dispositivo, difetto) e
     * a cercarci dentro, non a contarlo: `device_id`, `issue_id` e `customer_id` sono NOT
     * NULL con vincolo di chiave esterna, quindi le inner join non possono né scartare né
     * duplicare righe, e quella su `collaborator` è una left join, che per definizione non
     * cambia un conteggio. Il pianificatore elimina da solo le left join inutilizzate, ma non
     * le inner join: quelle andavano tolte scrivendole.
     *
     * Quando c'è una ricerca libera i join restano, perché le condizioni parlano proprio di
     * quelle tabelle: lì il conteggio costa quanto prima, ed è la voce 4 del backlog
     * prestazioni ad occuparsene.
     */
    const countSelect = db.select({ total: sql<number>`count(*)` }).from(reportTable);
    const countQuery =
        searchConditions.length > 0
            ? countSelect
                  .innerJoin(customerTable, eq(customerTable.id, reportTable.customerId))
                  .innerJoin(deviceTable, eq(deviceTable.id, reportTable.deviceId))
                  .innerJoin(IssueTable, eq(IssueTable.id, reportTable.issueId))
                  .leftJoin(collaboratorTable, eq(collaboratorTable.id, reportTable.collaboratorId))
                  .where(whereClause)
            : countSelect.where(whereClause);

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

const getTrailingMonthKeys = (monthsCount: number) => {
    const now = new Date();

    return Array.from({ length: monthsCount }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (monthsCount - 1 - index), 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    });
};

export const getReportStats = async (month?: string) => {
    const seriesMonthKeys = getTrailingMonthKeys(6);
    const targetMonthKey = month ?? seriesMonthKeys[seriesMonthKeys.length - 1];
    const earliestMonthKey = [...seriesMonthKeys, targetMonthKey].sort()[0];
    const rangeStartDate = `${earliestMonthKey}-01`;

    const [statusCountRows, revenueRows] = await Promise.all([
        db
            .select({ closed: reportTable.closed, count: sql<number>`count(*)::int` })
            .from(reportTable)
            .groupBy(reportTable.closed),
        db
            .select({
                month: sql<string>`to_char(${reportTable.created_at}, 'YYYY-MM')`,
                revenue: sql<number>`coalesce(sum(${reportTable.price} + coalesce(${reportTechnicianTable.price}, 0)), 0)::int`,
            })
            .from(reportTable)
            // Stesso join diretto sulla chiave primaria usato da `listReports`: vedi lì il
            // perché il `GROUP BY` non serve.
            .leftJoin(reportTechnicianTable, eq(reportTechnicianTable.reportId, reportTable.id))
            .where(and(eq(reportTable.closed, true), sql`${reportTable.created_at} >= ${rangeStartDate}`))
            .groupBy(sql`to_char(${reportTable.created_at}, 'YYYY-MM')`),
    ]);

    const revenueByMonth = new Map(revenueRows.map((row) => [row.month, Number(row.revenue)]));

    return {
        openCount: Number(statusCountRows.find((row) => !row.closed)?.count ?? 0),
        closedCount: Number(statusCountRows.find((row) => row.closed)?.count ?? 0),
        monthlyRevenue: revenueByMonth.get(targetMonthKey) ?? 0,
        series: seriesMonthKeys.map((monthKey) => ({
            monthKey,
            value: revenueByMonth.get(monthKey) ?? 0,
        })),
    };
};

export const getReportById = (id: number) => db.select().from(reportTable).where(eq(reportTable.id, id));

export const createReport = (data: NewReport) => db.insert(reportTable).values(data).returning();

export const updateReportById = (id: number, data: UpdateReport) =>
    db
        .update(reportTable)
        .set({
            ...data,
            updated_at: new Date(),
        })
        .where(eq(reportTable.id, id))
        .returning();

export const deleteReportById = (id: number) => db.delete(reportTable).where(eq(reportTable.id, id)).returning();
