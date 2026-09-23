import type { Router } from "express";
import { listInterventions } from "../db/queries/intervention";
import { listReports } from "../db/queries/report";
import type { UnpaginatedLimit } from "../db/queries/pagination";
import { createCustomerInterventionsPdfBuffer, type CustomerInterventionsPrintData } from "../services/interventionPdf";
import { createCustomerReportsPdfBuffer, type CustomerReportsPrintData } from "../services/reportPdf";
import type { LabConfig } from "../config/lab";
import { idParamsSchema, printRangeQuerySchema } from "./crudRouter";
import { buildDateRangeLabel, formatDateLabel, formatScheduleLabel } from "./formatting";
import { validate } from "./validation";

/**
 * Tetto delle righe di un resoconto PDF. Il periodo è facoltativo, e senza date il resoconto di un
 * collaboratore prende tutti i report che ha chiuso da quando esiste l'archivio: pdfmake li impagina
 * in modo sincrono, e per tutto quel tempo il server non risponde a nessuna postazione. Prima valeva
 * il tetto delle liste (5000 righe, troncate in silenzio con un warning nel log): un resoconto
 * incompleto senza che nessuno lo sappia. Duemila righe sono una cinquantina di pagine; oltre, la
 * richiesta si rifiuta e il messaggio chiede di restringere il periodo.
 */
const summaryRowLimit: UnpaginatedLimit = {
    maxRows: 2000,
    onOverflow: "reject",
    tooLargeMessage: "Il resoconto supera le 2000 righe: scegli un periodo più breve e stampalo in più parti.",
};

/** L'intestazione del resoconto: chi è il soggetto, più i dati del laboratorio. */
type SummaryContext = Omit<CustomerReportsPrintData, "rangeLabel" | "reportCount" | "reports"> &
    Omit<CustomerInterventionsPrintData, "rangeLabel" | "interventionCount" | "interventions"> &
    LabConfig;

type SummaryPrintOptions = {
    /** Prefisso del nome del file: `customer-5-reports.pdf`. */
    filePrefix: "customer" | "collaborator";
    notFoundMessage: string;
    loadContext: (id: number) => Promise<SummaryContext | null>;
    /** Il filtro delle due liste: i report e gli interventi di quel cliente o collaboratore. */
    filterFor: (id: number) => { customerId: number } | { collaboratorId: number };
};

/**
 * Le due stampe dei resoconti (report e interventi) di una scheda. Cliente e collaboratore avevano
 * quattro handler quasi uguali, circa 180 righe copiate, e le copie divergevano già: il nome del
 * cliente di ogni riga arrivava solo nel resoconto del collaboratore. Qui lo si passa sempre; il
 * PDF lo mostra solo con `showCustomerColumn`.
 */
export const registerSummaryPrintRoutes = (router: Router, options: SummaryPrintOptions) => {
    const { filePrefix, notFoundMessage, loadContext, filterFor } = options;
    const validation = validate({ params: idParamsSchema, query: printRangeQuerySchema });

    const loadRequest = async (params: unknown, query: unknown) => {
        const { id } = params as { id: number };
        const { dateFrom, dateTo } = query as { dateFrom?: string; dateTo?: string };
        const context = await loadContext(id);

        return {
            id,
            context,
            rangeLabel: buildDateRangeLabel(dateFrom, dateTo),
            listParams: context
                ? { ...filterFor(id), dateFrom, dateTo, timeZone: context.timeZone, unpaginatedLimit: summaryRowLimit }
                : null,
        };
    };

    router.get("/:id/reports/print", validation, async (req, res) => {
        const { id, context, rangeLabel, listParams } = await loadRequest(req.params, req.query);

        if (!context || !listParams) {
            res.status(404).json({ message: notFoundMessage });
            return;
        }

        const result = await listReports(listParams);
        // Senza `page` la lista è sempre un array: il ramo `items` serve solo al tipo.
        const reports = Array.isArray(result) ? result : result.items;

        const pdfBuffer = await createCustomerReportsPdfBuffer({
            ...context,
            rangeLabel,
            reportCount: reports.length,
            reports: reports.map((report) => ({
                id: report.id,
                createdAtLabel: formatDateLabel(report.createdAt, context.timeZone),
                customerName: report.customer,
                deviceName: report.device,
                // Il problema, non l'etichetta del catalogo: stessa espressione SQL della
                // ricevuta (`routes/reports.ts`), da `listReports`. Prima qui c'era sempre
                // `report.issue`, l'etichetta, anche quando esisteva una descrizione scritta
                // a mano più precisa (vedi D5 nel CHANGELOG).
                issueDescription: report.issueText,
                closed: report.closed,
                alerted: report.alerted,
                paymentMethod: report.paymentMethod,
                totalPrice: report.totalPrice,
            })),
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename=${filePrefix}-${id}-reports.pdf`);
        res.send(pdfBuffer);
    });

    router.get("/:id/interventions/print", validation, async (req, res) => {
        const { id, context, rangeLabel, listParams } = await loadRequest(req.params, req.query);

        if (!context || !listParams) {
            res.status(404).json({ message: notFoundMessage });
            return;
        }

        const result = await listInterventions(listParams);
        const interventions = Array.isArray(result) ? result : result.items;

        const pdfBuffer = await createCustomerInterventionsPdfBuffer({
            ...context,
            rangeLabel,
            interventionCount: interventions.length,
            interventions: interventions.map((intervention) => ({
                id: intervention.id,
                createdAtLabel: formatDateLabel(intervention.createdAt, context.timeZone),
                customerName: intervention.customer,
                type: intervention.type,
                status: intervention.status,
                description: intervention.description,
                scheduleLabel: formatScheduleLabel(
                    intervention.interventionDate,
                    intervention.startTime,
                    intervention.endTime
                ),
                price: intervention.price,
            })),
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename=${filePrefix}-${id}-interventions.pdf`);
        res.send(pdfBuffer);
    });
};
