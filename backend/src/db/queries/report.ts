import { and, asc, desc, eq, getTableColumns, gte, inArray, or, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "../index";
import {
    collaboratorTable,
    customerTable,
    deviceTable,
    IssueTable,
    reportTable,
    reportTechnicianTable,
    technicianTable,
} from "../schema";
import type { NewReport, UpdateReport } from "../types";
import { takeUnpaginated, type UnpaginatedLimit } from "./pagination";
import { parseIdSearch } from "./search";
import { currentMonthKey, localDayStartUtc, onLocalDays, toLocalTimestamp } from "./timeZone";

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
    /** Il fuso in cui leggere `dateFrom`/`dateTo`: vedi `timeZone.ts`. */
    timeZone: string;
    /** Tetto e comportamento senza paginazione: gli export passano `exportRowLimit`. */
    unpaginatedLimit?: UnpaginatedLimit;
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
    unpaginatedLimit,
    timeZone,
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
    const dateCondition = onLocalDays(reportTable.created_at, { from: dateFrom, to: dateTo }, timeZone);
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
        return takeUnpaginated(baseQuery.where(whereClause).orderBy(orderByClause), "reports", unpaginatedLimit);
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

/** Gli ultimi `monthsCount` mesi fino a quello corrente del laboratorio, dal più vecchio. */
const getTrailingMonthKeys = (monthsCount: number, timeZone: string, now = new Date()) => {
    const [currentYear, currentMonth] = currentMonthKey(timeZone, now).split("-").map(Number);

    return Array.from({ length: monthsCount }, (_, index) => {
        // Date.UTC solo per l'aritmetica dei mesi (gennaio meno uno è dicembre dell'anno prima).
        const date = new Date(Date.UTC(currentYear, currentMonth - 1 - (monthsCount - 1 - index), 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    });
};

export const getReportStats = async (month: string | undefined, timeZone: string, now = new Date()) => {
    const seriesMonthKeys = getTrailingMonthKeys(6, timeZone, now);
    const targetMonthKey = month ?? seriesMonthKeys[seriesMonthKeys.length - 1];
    const earliestMonthKey = [...seriesMonthKeys, targetMonthKey].sort()[0];
    // Il mese di un report è quello del laboratorio: un report delle 00:30 del primo del mese a
    // Roma è di quel mese, anche se in UTC è ancora il giorno prima.
    const localMonth = sql<string>`to_char(${toLocalTimestamp(reportTable.created_at, timeZone)}, 'YYYY-MM')`;

    const [statusCountRows, revenueRows] = await Promise.all([
        db
            .select({ closed: reportTable.closed, count: sql<number>`count(*)::int` })
            .from(reportTable)
            .groupBy(reportTable.closed),
        db
            .select({
                month: localMonth,
                revenue: sql<number>`coalesce(sum(${reportTable.price} + coalesce(${reportTechnicianTable.price}, 0)), 0)::int`,
                // Compenso pagato ai tecnici esterni: l'incasso netto è il totale meno questa
                // spesa, non un'altra colonna della riga (`report.price` da solo non basta
                // perché un report può non avere alcun tecnico esterno assegnato).
                technicianCost: sql<number>`coalesce(sum(coalesce(${reportTechnicianTable.price}, 0)), 0)::int`,
            })
            .from(reportTable)
            // Stesso join diretto sulla chiave primaria usato da `listReports`: vedi lì il
            // perché il `GROUP BY` non serve.
            .leftJoin(reportTechnicianTable, eq(reportTechnicianTable.reportId, reportTable.id))
            .where(
                and(
                    eq(reportTable.closed, true),
                    gte(reportTable.created_at, localDayStartUtc(`${earliestMonthKey}-01`, timeZone))
                )
            )
            // Per posizione (la prima colonna, `month`), non ripetendo l'espressione: il fuso vi
            // entra come parametro, e per Postgres `… AT TIME ZONE $2` nella SELECT e
            // `… AT TIME ZONE $5` nel GROUP BY sono espressioni diverse, quindi un errore.
            .groupBy(sql`1`),
    ]);

    const revenueByMonth = new Map(revenueRows.map((row) => [row.month, Number(row.revenue)]));
    const technicianCostByMonth = new Map(revenueRows.map((row) => [row.month, Number(row.technicianCost)]));
    const netRevenueOf = (monthKey: string) =>
        (revenueByMonth.get(monthKey) ?? 0) - (technicianCostByMonth.get(monthKey) ?? 0);

    return {
        openCount: Number(statusCountRows.find((row) => !row.closed)?.count ?? 0),
        closedCount: Number(statusCountRows.find((row) => row.closed)?.count ?? 0),
        monthlyRevenue: revenueByMonth.get(targetMonthKey) ?? 0,
        monthlyNetRevenue: netRevenueOf(targetMonthKey),
        series: seriesMonthKeys.map((monthKey) => ({
            monthKey,
            value: revenueByMonth.get(monthKey) ?? 0,
            netValue: netRevenueOf(monthKey),
        })),
    };
};

export const getReportById = (id: number) => db.select().from(reportTable).where(eq(reportTable.id, id));

const personName = (firstName: SQLWrapper, lastName: SQLWrapper) =>
    sql<string | null>`nullif(concat_ws(' ', ${firstName}, ${lastName}), '')`;

/**
 * Il report con i nomi di ciò a cui rimanda e con il suo tecnico esterno (`technicianId` null e
 * `technicianPrice` 0 se non ce l'ha).
 *
 * La pagina di dettaglio mostra quei nomi, e prima per trovarli scaricava i cataloghi interi di
 * dispositivi, difetti, collaboratori e tecnici, più il cliente a parte: sei richieste per
 * aprire un report. Il tecnico ci viaggia per lo stesso motivo: il dialogo di modifica lo vuole
 * sempre, e prima lo cercava scaricando l'intera `report_technician`.
 */
export const getReportDetailById = (id: number) =>
    db
        .select({
            ...getTableColumns(reportTable),
            customerName: personName(customerTable.firstName, customerTable.lastName),
            customerPhone: sql<
                string | null
            >`coalesce(${customerTable.phoneNumber}, ${customerTable.phoneNumberSecondary})`,
            deviceName: deviceTable.name,
            issueName: IssueTable.description,
            collaboratorName: personName(collaboratorTable.firstName, collaboratorTable.lastName),
            technicianId: reportTechnicianTable.technicianId,
            technicianPrice: sql<number>`coalesce(${reportTechnicianTable.price}, 0)::int`,
            technicianName: personName(technicianTable.firstName, technicianTable.lastName),
        })
        .from(reportTable)
        .innerJoin(customerTable, eq(customerTable.id, reportTable.customerId))
        .innerJoin(deviceTable, eq(deviceTable.id, reportTable.deviceId))
        .innerJoin(IssueTable, eq(IssueTable.id, reportTable.issueId))
        .leftJoin(collaboratorTable, eq(collaboratorTable.id, reportTable.collaboratorId))
        // Al più una riga: `report_id` è l'intera chiave primaria di `report_technician`.
        .leftJoin(reportTechnicianTable, eq(reportTechnicianTable.reportId, reportTable.id))
        .leftJoin(technicianTable, eq(technicianTable.id, reportTechnicianTable.technicianId))
        .where(eq(reportTable.id, id));

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
