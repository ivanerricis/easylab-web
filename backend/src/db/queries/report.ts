import { and, asc, desc, eq, getTableColumns, gte, inArray, or, sql } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
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
import { personName, personNameOrDash } from "./personName";
import { containsText, parseIdSearch } from "./search";
import { currentMonthKey, localDayStartUtc, onLocalDays, toLocalTimestamp } from "./timeZone";

type ReportSortBy = "createdAt" | "customer";

/**
 * Il prezzo interno più il compenso del tecnico esterno (0 se non ce l'ha). A livello di modulo,
 * e non più ricreata a ogni chiamata di `listReports`: `getReportDetailById` la usa allo stesso
 * modo per `totalPrice`, e prima quest'ultimo veniva ricalcolato in JS dalla rotta
 * (`report.price + Number(report.technicianPrice)`), una copia della stessa somma che qui è già
 * in SQL.
 */
const totalPriceExpr = sql<number>`(${reportTable.price} + coalesce(${reportTechnicianTable.price}, 0))`;

/**
 * Il problema del report: la descrizione scritta a mano se c'è, altrimenti l'etichetta del
 * difetto dal catalogo. Prima questa regola viveva solo in JS nella rotta della ricevuta
 * (`report.issueDescription?.trim() || report.issueName`): il resoconto PDF (`summaryPrint.ts`)
 * stampava invece sempre l'etichetta del catalogo, anche quando c'era una descrizione più
 * precisa (tipicamente col difetto "Altro", dove l'etichetta da sola non dice niente). Un'unica
 * espressione SQL, usata sia da `listReports` (il resoconto) sia da `getReportDetailById` (la
 * ricevuta), rende impossibile che le due tornino a dire cose diverse.
 */
const issueTextExpr = sql<string>`coalesce(nullif(trim(${reportTable.issueDescription}), ''), ${IssueTable.description})`;

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

/**
 * Gli id dei report che corrispondono alla ricerca libera: una query per tabella, unite.
 *
 * Prima era un'unica `OR` sulle colonne di cinque tabelle unite. Postgres usa gli indici
 * trigram solo se l'`OR` riguarda una tabella sola, quindi leggeva l'intero archivio unito e
 * filtrava dopo: anche una ricerca senza risultati costava come una piena, e il conteggio del
 * totale di più. Qui ogni ramo resta su una tabella e sui suoi indici. Misure sul database di
 * sviluppo (20.000 report, pagina + totale): "rossi" 325 → 90 ms, una password 525 → 33 ms,
 * nessun risultato 800 → 4 ms. Vedi CHANGELOG del 2026-09-17.
 *
 * Solo colonne di testo, più il numero del report come confronto esatto (vedi `search.ts`).
 * Data, stato e metodo di pagamento si cercano dai filtri dedicati. `report.db.test.ts` elenca
 * campo per campo cosa deve trovare.
 */
const matchingReportIds = (search: string) => {
    const pattern = `%${search}%`;
    const idSearch = parseIdSearch(search);
    const reportIds = () => db.select({ id: reportTable.id }).from(reportTable);

    return union(
        reportIds().where(
            or(
                idSearch != null ? eq(reportTable.id, idSearch) : undefined,
                containsText(reportTable.note, pattern),
                containsText(reportTable.password, pattern),
                containsText(reportTable.issueDescription, pattern),
                containsText(reportTable.serviceDescription, pattern)
            )
        ),
        reportIds()
            .innerJoin(customerTable, eq(customerTable.id, reportTable.customerId))
            .where(
                or(
                    containsText(customerTable.firstName, pattern),
                    containsText(customerTable.lastName, pattern),
                    containsText(customerTable.phoneNumber, pattern),
                    containsText(customerTable.phoneNumberSecondary, pattern),
                    containsText(customerTable.email, pattern)
                )
            ),
        reportIds()
            .innerJoin(deviceTable, eq(deviceTable.id, reportTable.deviceId))
            .where(containsText(deviceTable.name, pattern)),
        reportIds()
            .innerJoin(IssueTable, eq(IssueTable.id, reportTable.issueId))
            .where(containsText(IssueTable.description, pattern)),
        reportIds()
            .innerJoin(collaboratorTable, eq(collaboratorTable.id, reportTable.collaboratorId))
            .where(
                or(
                    containsText(collaboratorTable.firstName, pattern),
                    containsText(collaboratorTable.lastName, pattern),
                    containsText(collaboratorTable.phoneNumber, pattern)
                )
            )
    );
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
    const searchCondition = trimmedSearch ? inArray(reportTable.id, matchingReportIds(trimmedSearch)) : undefined;
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
    // con sé i join (vedi il commento su `countQuery`), quindi una condizione su
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
    const whereConditions = [
        visibilityCondition,
        dateCondition,
        customerCondition,
        collaboratorCondition,
        technicianCondition,
        searchCondition,
    ].filter((condition): condition is NonNullable<typeof condition> => condition != null);
    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const customerSortExpr = personNameOrDash(customerTable.firstName, customerTable.lastName);
    const sortColumn = sortBy === "customer" ? customerSortExpr : reportTable.created_at;
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
            issueText: issueTextExpr,
            // Il collaboratore che ha in carico il report (non il tecnico esterno: vedi
            // `technicianName` qui sotto). Si chiamava `technician`, ma la colonna che legge è
            // sempre stata quella del collaboratore — vedi D4 nel CHANGELOG.
            collaborator: personNameOrDash(collaboratorTable.firstName, collaboratorTable.lastName),
            technicianPrice: sql<number>`coalesce(${reportTechnicianTable.price}, 0)::int`,
            // Il vero tecnico esterno, dal join su `technicianTable` qui sotto: `null` se il
            // report non ne ha uno assegnato.
            technicianName: personName(technicianTable.firstName, technicianTable.lastName),
            totalPrice: sql<number>`${totalPriceExpr}::int`,
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
        .leftJoin(reportTechnicianTable, eq(reportTechnicianTable.reportId, reportTable.id))
        // Solo per il nome: al più una riga, per lo stesso motivo del join qui sopra.
        .leftJoin(technicianTable, eq(technicianTable.id, reportTechnicianTable.technicianId));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery.where(whereClause).orderBy(orderByClause), "reports", unpaginatedLimit);
    }

    /**
     * Il totale non porta con sé i join delle righe.
     *
     * Le colonne unite servono a *mostrare* un report (nome cliente, dispositivo, difetto), non
     * a contarlo: `device_id`, `issue_id` e `customer_id` sono NOT NULL con vincolo di chiave
     * esterna, quindi le inner join non possono né scartare né duplicare righe, e quella su
     * `collaborator` è una left join, che per definizione non cambia un conteggio. Il
     * pianificatore elimina da solo le left join inutilizzate, ma non le inner join: quelle
     * andavano tolte scrivendole. Anche la ricerca guarda solo `report.id` (vedi
     * `matchingReportIds`), quindi vale con e senza.
     */
    const countQuery = db
        .select({ total: sql<number>`count(*)` })
        .from(reportTable)
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

/**
 * Il report con i nomi di ciò a cui rimanda e con il suo tecnico esterno (`technicianId` null e
 * `technicianPrice` 0 se non ce l'ha).
 *
 * La pagina di dettaglio mostra quei nomi, e prima per trovarli scaricava i cataloghi interi di
 * dispositivi, difetti, collaboratori e tecnici, più il cliente a parte: sei richieste per
 * aprire un report. Il tecnico ci viaggia per lo stesso motivo: il dialogo di modifica lo vuole
 * sempre, e prima lo cercava scaricando l'intera `report_technician`.
 *
 * La usa anche la stampa della ricevuta (`GET /reports/:id/print`), che prima riscriveva gli
 * stessi join per conto suo: da lì i due telefoni separati, che la ricevuta scrive entrambi.
 */
export const getReportDetailById = (id: number) =>
    db
        .select({
            ...getTableColumns(reportTable),
            customerName: personName(customerTable.firstName, customerTable.lastName),
            customerPhone: sql<
                string | null
            >`coalesce(${customerTable.phoneNumber}, ${customerTable.phoneNumberSecondary})`,
            customerPhoneNumber: customerTable.phoneNumber,
            customerPhoneSecondary: customerTable.phoneNumberSecondary,
            deviceName: deviceTable.name,
            issueName: IssueTable.description,
            collaboratorName: personName(collaboratorTable.firstName, collaboratorTable.lastName),
            technicianId: reportTechnicianTable.technicianId,
            technicianPrice: sql<number>`coalesce(${reportTechnicianTable.price}, 0)::int`,
            technicianName: personName(technicianTable.firstName, technicianTable.lastName),
            // Stessa espressione di `listReports`: la scheda del report (`GET /api/reports/:id`)
            // la espone al frontend invece di lasciargliela ricalcolare (vedi CHANGELOG).
            totalPrice: sql<number>`${totalPriceExpr}::int`,
            issueText: issueTextExpr,
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

/**
 * Il tecnico esterno di un report, come arriva con il report stesso: `technicianId` null lo toglie.
 *
 * Prima era una risorsa a parte (`/api/report-technicians/:reportId/:technicianId`), e ogni pagina
 * che salvava un report decideva da sé se aggiungere, aggiornare, sostituire o togliere la riga,
 * con due o tre richieste dopo quella del report. Quella logica era copiata identica in tre pagine,
 * e un errore a metà lasciava il report salvato col tecnico vecchio. Dalla migration 0004 un report
 * ha al più un tecnico, quindi è un suo attributo: si scrive nella stessa transazione.
 */
export type ReportTechnicianInput = { technicianId: number | null; price: number };

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const setReportTechnician = async (tx: Transaction, reportId: number, technician: ReportTechnicianInput) => {
    if (technician.technicianId == null) {
        await tx.delete(reportTechnicianTable).where(eq(reportTechnicianTable.reportId, reportId));
        return;
    }

    const values = { technicianId: technician.technicianId, price: technician.price };

    await tx
        .insert(reportTechnicianTable)
        .values({ reportId, ...values })
        .onConflictDoUpdate({ target: reportTechnicianTable.reportId, set: { ...values, updated_at: sql`now()` } });
};

export const createReport = (data: NewReport, technician?: ReportTechnicianInput) =>
    db.transaction(async (tx) => {
        const createdReport = await tx.insert(reportTable).values(data).returning();

        if (technician) {
            await setReportTechnician(tx, createdReport[0].id, technician);
        }

        return createdReport;
    });

/**
 * `updated_at` lo scrive lo schema (`$onUpdate`). Quando cambia solo il tecnico la riga del report
 * non ha campi da scrivere, e drizzle rifiuta un `set` vuoto ("No values to set"): lì si scrive
 * `updated_at` e basta, che è anche giusto, perché il report è cambiato.
 */
export const updateReportById = (id: number, data: UpdateReport, technician?: ReportTechnicianInput) =>
    db.transaction(async (tx) => {
        const fields = Object.keys(data).length > 0 ? data : { updated_at: new Date() };
        const updatedReport = await tx.update(reportTable).set(fields).where(eq(reportTable.id, id)).returning();

        if (technician && updatedReport.length > 0) {
            await setReportTechnician(tx, id, technician);
        }

        return updatedReport;
    });

export const deleteReportById = (id: number) => db.delete(reportTable).where(eq(reportTable.id, id)).returning();
