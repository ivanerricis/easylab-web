import { Router } from "express";
import { z } from "zod";
import {
    createReport,
    deleteReportById,
    getReportById,
    getReportDetailById,
    getReportStats,
    listReports,
    updateReportById,
    type ReportTechnicianInput,
} from "../db/queries/report";
import { getIssueById } from "../db/queries/issue";
import { createReportPdfBuffer } from "../services/reportPdf";
import { formatReportPaymentMethod } from "../services/reportLabels";
import { isCatchAllIssueDescription } from "../services/issueCatalog";
import { getAppTimeZone, getLabConfig } from "../config/lab";
import { toCsv } from "../services/csv";
import { exportRowLimit } from "../db/queries/pagination";
import { formatDateLabel, formatPhoneLabel } from "./formatting";
import { idParamsSchema, listQuerySchema, sendListResponse } from "./crudRouter";
import { validate } from "./validation";
import { reportPaymentMethods } from "../db/schema";

const reportsRouter = Router();

const reportSortFields = ["createdAt", "customer"] as const;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Estende lo schema di lista condiviso invece di ridichiararne i campi: `page`, `pageSize`
// e `search` hanno gli stessi limiti di tutte le altre liste, e `sortBy` viene ristretto
// qui alle sole colonne che questa rotta sa davvero ordinare.
const reportListQuerySchema = listQuerySchema.extend({
    visibility: z.enum(["all", "open", "closed"]).optional(),
    dateFrom: z.string().regex(dateRegex).optional(),
    dateTo: z.string().regex(dateRegex).optional(),
    // Filtro per collaboratore: lo usa la sua scheda, che prima si portava in pagina le
    // prime cinquemila righe della tabella e le filtrava nel browser — cioè ne mostrava
    // una parte, senza dirlo.
    collaboratorId: z.coerce.number().int().positive().optional(),
    // Stesso motivo, per le schede del cliente e del tecnico esterno: filtravano nel
    // browser le prime cinquemila righe, e un cliente i cui report stavano oltre risultava
    // "senza report".
    customerId: z.coerce.number().int().positive().optional(),
    technicianId: z.coerce.number().int().positive().optional(),
    sortBy: z.enum(reportSortFields).optional(),
});

const reportBodySchema = z
    .object({
        deviceId: z.coerce.number().int().positive(),
        issueId: z.coerce.number().int().positive(),
        collaboratorId: z.coerce.number().int().positive().nullable().optional(),
        customerId: z.coerce.number().int().positive(),
        note: z.string().trim().min(1).max(255).nullable().optional(),
        password: z.string().trim().min(1).max(255).nullable().optional(),
        issueDescription: z.string().trim().min(1).max(255).nullable().optional(),
        serviceDescription: z.string().trim().min(1).max(255).nullable().optional(),
        dataBackup: z.boolean().optional(),
        charger: z.boolean().optional(),
        alerted: z.boolean().optional(),
        closed: z.boolean().optional(),
        paymentMethod: z.enum(reportPaymentMethods).optional(),
        price: z.coerce.number().int().min(0).optional(),
        // Il tecnico esterno viaggia con il report: `null` lo toglie, assente lo lascia com'è.
        // Vedi `ReportTechnicianInput`.
        technicianId: z.coerce.number().int().positive().nullable().optional(),
        technicianPrice: z.coerce.number().int().min(0).optional(),
    })
    .strict();

// Un compenso senza dire di quale tecnico non ha un significato univoco (il tecnico di prima?
// nessuno?): si mandano insieme.
const technicianPriceNeedsTechnician = {
    check: (value: { technicianId?: number | null; technicianPrice?: number }) =>
        value.technicianPrice === undefined || value.technicianId !== undefined,
    message: { message: "Il compenso del tecnico va inviato insieme al tecnico", path: ["technicianPrice"] },
};

// Le due regole "pagato ⇒ prezzo > 0" e "chiuso ⇒ collaboratore" NON sono più controllate qui né
// a mano nella rotta: le applica il CHECK di riga della migration 0035_report_domain_checks, che
// `errorHandler.ts` traduce nello stesso messaggio italiano (vedi CHECK_MESSAGES lì). Un doppio
// controllo — uno qui via zod e uno nel database — era esattamente la duplicazione che il
// backlog segnalava, con il rischio concreto che i due si allontanassero nelle parole: la PUT,
// che valida la riga *unione* di corpo parziale ed esistente, non può comunque vederle da uno
// schema, quindi l'unico posto in cui *entrambe* le rotte vedono la riga davvero risultante è il
// database. Il dialogo di creazione (`createReportDialog.tsx`) non raccoglie nemmeno pagamento,
// prezzo o chiusura — li aggiunge solo il dialogo di modifica — quindi non perde nessun
// evidenziamento di campo lasciando che sia il database a deciderlo.
const reportCreateBodySchema = reportBodySchema.refine(
    technicianPriceNeedsTechnician.check,
    technicianPriceNeedsTechnician.message
);

const reportUpdateBodySchema = reportBodySchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
        message: "È necessario specificare almeno un campo",
    })
    .refine(technicianPriceNeedsTechnician.check, technicianPriceNeedsTechnician.message);

/** Separa il tecnico dai campi della riga `report`: vanno in due tabelle. */
const splitTechnician = <T extends { technicianId?: number | null; technicianPrice?: number }>({
    technicianId,
    technicianPrice,
    ...report
}: T) => ({
    report,
    technician:
        technicianId === undefined
            ? undefined
            : ({
                  technicianId,
                  price: technicianId == null ? 0 : (technicianPrice ?? 0),
              } satisfies ReportTechnicianInput),
});

reportsRouter.get("/", validate({ query: reportListQuerySchema }), async (req, res) => {
    // Il tipo viene dallo schema, non da una copia scritta a mano: una copia dimentica i campi
    // nuovi, e un filtro accettato dallo schema ma non letto qui verrebbe ignorato in silenzio.
    const query = req.query as unknown as z.infer<typeof reportListQuerySchema>;
    const { page, pageSize } = query;

    const reports = await listReports({
        ...query,
        visibility: query.visibility ?? (page == null || pageSize == null ? "all" : "open"),
        timeZone: await getAppTimeZone(),
    });

    sendListResponse(res, reports, page, pageSize);
});

// Gli stessi filtri della lista, meno pagina e dimensione pagina: l'export scarica sempre
// tutto ciò che passa il filtro, mai una sola pagina.
const reportExportQuerySchema = reportListQuerySchema.omit({ page: true, pageSize: true });

reportsRouter.get("/export.csv", validate({ query: reportExportQuerySchema }), async (req, res) => {
    const query = req.query as unknown as z.infer<typeof reportExportQuerySchema>;

    const reports = await listReports({
        ...query,
        visibility: query.visibility ?? "all",
        timeZone: await getAppTimeZone(),
        unpaginatedLimit: exportRowLimit,
    });
    const rows = Array.isArray(reports) ? reports : reports.items;

    const csv = toCsv(rows, [
        { header: "ID", value: (report) => report.id },
        { header: "Cliente", value: (report) => report.customer },
        { header: "Telefono cliente", value: (report) => report.customerPhone },
        { header: "Dispositivo", value: (report) => report.device },
        { header: "Difetto", value: (report) => report.issue },
        { header: "Descrizione problema", value: (report) => report.issueDescription },
        { header: "Intervento", value: (report) => report.serviceDescription },
        // Il collaboratore che ha in carico il report e il tecnico esterno vero (prima questa
        // colonna leggeva `technician`, che nonostante il nome era il collaboratore: vedi D4
        // nel CHANGELOG). `technicianName` è null quando il report non ha un tecnico esterno.
        { header: "Collaboratore", value: (report) => report.collaborator },
        { header: "Tecnico esterno", value: (report) => report.technicianName },
        { header: "Prezzo interno", value: (report) => report.price },
        { header: "Compenso tecnico", value: (report) => report.technicianPrice },
        { header: "Prezzo totale", value: (report) => report.totalPrice },
        {
            header: "Metodo di pagamento",
            value: (report) => formatReportPaymentMethod(report.paymentMethod),
        },
        { header: "Chiuso", value: (report) => report.closed },
        { header: "Note", value: (report) => report.note },
        { header: "Password", value: (report) => report.password },
        { header: "Creato il", value: (report) => report.createdAt },
    ]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=report.csv");
    res.send(csv);
});

const reportStatsQuerySchema = z.object({
    month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
});

reportsRouter.get("/stats", validate({ query: reportStatsQuerySchema }), async (req, res) => {
    const { month } = req.query as unknown as { month?: string };
    const stats = await getReportStats(month, await getAppTimeZone());

    res.json(stats);
});

reportsRouter.get("/:id/print", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const [report] = await getReportDetailById(id);

    if (!report) {
        res.status(404).json({ message: "Report non trovato" });
        return;
    }

    const { labName, labEmail, labAddress, labPhone, timeZone } = await getLabConfig();
    const customerPhoneLabel = formatPhoneLabel(report.customerPhoneNumber, report.customerPhoneSecondary);

    const pdfBuffer = await createReportPdfBuffer({
        id: report.id,
        labName,
        labEmail,
        labAddress,
        labPhone,
        customerName: report.customerName ?? "",
        customerPhone: customerPhoneLabel,
        deviceName: report.deviceName,
        /**
         * Sulla ricevuta va scritto il problema, non l'etichetta con cui il laboratorio lo
         * archivia. `issueText` (calcolata da `getReportDetailById`, la stessa espressione SQL
         * che usa il resoconto in `summaryPrint.ts`) è il testo scritto a mano se c'è —
         * esiste solo con il difetto "Altro", dove l'etichetta non direbbe niente a chi legge —
         * altrimenti l'etichetta stessa, che per tutti gli altri difetti è già una descrizione.
         */
        issueDescription: report.issueText,
        serviceDescription: report.serviceDescription,
        note: report.note ?? "-",
        password: report.password ?? "-",
        dataBackup: report.dataBackup,
        charger: report.charger,
        alerted: report.alerted,
        totalPrice: report.totalPrice,
        createdAtLabel: formatDateLabel(report.created_at, timeZone),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=report-${id}.pdf`);
    res.send(pdfBuffer);
});

/** Il report con i nomi di ciò a cui rimanda e il suo tecnico: vedi `getReportDetailById`. */
reportsRouter.get("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const [report] = await getReportDetailById(id);

    if (!report) {
        res.status(404).json({ message: "Report non trovato" });
        return;
    }

    res.json(report);
});

/**
 * "Altro" (vedi `issueCatalog.ts`) è la voce del catalogo che fa comparire, nel dialogo del
 * report, la casella dove il problema si scrive a mano: se il difetto scelto è quello e la
 * descrizione manca, il report finirebbe con un problema che sulla ricevuta e nel resoconto
 * mostrerebbe solo l'etichetta "Altro", che da sola non dice niente. Il dialogo di creazione
 * già lo impedisce lato client (`createReportDialog.tsx`, stesso messaggio) ma la regola va
 * ripetuta qui: è l'unico posto che vede davvero la riga *risultante* — per la POST il corpo
 * appena arrivato, per la PUT l'unione con quella esistente (calcolata dalla rotta prima di
 * chiamare questa funzione, come per `validateInterventionRow` in `interventions.ts`).
 */
const catchAllIssueDescriptionMessage = 'Con il difetto "Altro" va descritto il problema';

const validateIssueDescription = async (issueId: number, issueDescription: string | null | undefined) => {
    const [issue] = await getIssueById(issueId);

    if (!issue || !isCatchAllIssueDescription(issue.description) || issueDescription?.trim()) {
        return null;
    }

    return catchAllIssueDescriptionMessage;
};

reportsRouter.post("/", validate({ body: reportCreateBodySchema }), async (req, res) => {
    const { report, technician } = splitTechnician(req.body as z.infer<typeof reportCreateBodySchema>);
    const paymentMethod = report.paymentMethod ?? "non_paid";
    const price = report.price ?? 0;

    const issueDescriptionError = await validateIssueDescription(report.issueId, report.issueDescription);

    if (issueDescriptionError) {
        res.status(400).json({ message: issueDescriptionError });
        return;
    }

    // Il CHECK di riga sul database (migration 0035_report_domain_checks) fa rifiutare a
    // Postgres sia questa sia la PUT qui sotto: vedi il commento su `reportCreateBodySchema`.
    const createdReport = await createReport({ ...report, paymentMethod, price }, technician);

    res.status(201).json(createdReport[0]);
});

reportsRouter.put("/:id", validate({ params: idParamsSchema, body: reportUpdateBodySchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const existingReport = await getReportById(id);

    if (existingReport.length === 0) {
        res.status(404).json({ message: "Report non trovato" });
        return;
    }

    const { report, technician } = splitTechnician(req.body as z.infer<typeof reportUpdateBodySchema>);

    // La riga risultante (unione di questo corpo parziale con quella esistente, appena letta
    // qui sopra) è quella su cui vale la regola "Altro" ⇒ descrizione non vuota: senza la riga
    // esistente non sapremmo con quale difetto o quale descrizione confrontarci quando la PUT
    // ne cambia solo uno dei due. È anche il motivo per cui questa SELECT preliminare resta
    // (vedi il resoconto finale dell'agente).
    const nextIssueId = report.issueId ?? existingReport[0].issueId;
    const nextIssueDescription =
        "issueDescription" in report ? report.issueDescription : existingReport[0].issueDescription;
    const issueDescriptionError = await validateIssueDescription(nextIssueId, nextIssueDescription);

    if (issueDescriptionError) {
        res.status(400).json({ message: issueDescriptionError });
        return;
    }

    // Prezzo/pagamento e chiusura/collaboratore non si controllano più qui a mano: la riga
    // risultante (l'unione di questo corpo parziale con quella esistente) è quella che Postgres
    // vede al momento dell'UPDATE, e il CHECK di riga della migration 0035_report_domain_checks
    // la rifiuta da solo se viola una delle due regole. `errorHandler.ts` traduce la violazione
    // nello stesso messaggio italiano che questa rotta dava prima a mano.
    const updatedReport = await updateReportById(id, report, technician);

    if (updatedReport.length === 0) {
        res.status(404).json({ message: "Report non trovato" });
        return;
    }

    res.json(updatedReport[0]);
});

reportsRouter.delete("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const deletedReport = await deleteReportById(id);

    if (deletedReport.length === 0) {
        res.status(404).json({ message: "Report non trovato" });
        return;
    }

    res.json(deletedReport[0]);
});

export default reportsRouter;
