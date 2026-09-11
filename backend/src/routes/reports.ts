import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
    createReport,
    deleteReportById,
    getReportById,
    getReportStats,
    listReports,
    updateReportById,
} from "../db/queries/report";
import { getReportTechnicianByReportId } from "../db/queries/reportTechnician";
import { db } from "../db";
import { customerTable, deviceTable, IssueTable, reportTechnicianTable, reportTable } from "../db/schema";
import { createReportPdfBuffer } from "../services/reportPdf";
import { getLabConfig } from "../config/lab";
import { formatDateLabel, formatPhoneLabel } from "./formatting";
import { idParamsSchema, listQuerySchema, sendListResponse } from "./crudRouter";
import { validate } from "./validation";

const reportsRouter = Router();
const reportPaymentMethods = ["non_paid", "cash", "card"] as const;
type ReportPaymentMethod = (typeof reportPaymentMethods)[number];
const paidPaymentMethods = new Set<ReportPaymentMethod>(["cash", "card"]);

const reportSortFields = ["createdAt", "customer", "totalPrice"] as const;
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
    })
    .strict();

const reportCreateBodySchema = reportBodySchema.refine(
    (value) => {
        const paymentMethod = value.paymentMethod ?? "non_paid";
        const price = value.price ?? 0;

        return !paidPaymentMethods.has(paymentMethod) || price > 0;
    },
    {
        message: "Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0",
        path: ["price"],
    }
);

const reportUpdateBodySchema = reportBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
});

reportsRouter.get("/", validate({ query: reportListQuerySchema }), async (req, res) => {
    const {
        page,
        pageSize,
        search,
        visibility,
        dateFrom,
        dateTo,
        collaboratorId,
        customerId,
        technicianId,
        sortBy,
        sortOrder,
    } = req.query as unknown as {
        page?: number;
        pageSize?: number;
        search?: string;
        visibility?: "all" | "open" | "closed";
        dateFrom?: string;
        dateTo?: string;
        collaboratorId?: number;
        customerId?: number;
        technicianId?: number;
        sortBy?: (typeof reportSortFields)[number];
        sortOrder?: "asc" | "desc";
    };

    const reports = await listReports({
        page,
        pageSize,
        search,
        visibility: visibility ?? (page == null || pageSize == null ? "all" : "open"),
        dateFrom,
        dateTo,
        collaboratorId,
        customerId,
        technicianId,
        sortBy,
        sortOrder,
    });

    sendListResponse(res, reports, page, pageSize);
});

const reportStatsQuerySchema = z.object({
    month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
});

reportsRouter.get("/stats", validate({ query: reportStatsQuerySchema }), async (req, res) => {
    const { month } = req.query as unknown as { month?: string };
    const stats = await getReportStats(month);

    res.json(stats);
});

reportsRouter.get("/:id/print", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const [reportRows, technicianPriceRows] = await Promise.all([
        db
            .select({
                id: reportTable.id,
                note: reportTable.note,
                password: reportTable.password,
                issueDescription: reportTable.issueDescription,
                issueLabel: IssueTable.description,
                dataBackup: reportTable.dataBackup,
                charger: reportTable.charger,
                alerted: reportTable.alerted,
                price: reportTable.price,
                createdAt: reportTable.created_at,
                customerFirstName: customerTable.firstName,
                customerLastName: customerTable.lastName,
                customerPhone: customerTable.phoneNumber,
                customerPhoneSecondary: customerTable.phoneNumberSecondary,
                deviceName: deviceTable.name,
            })
            .from(reportTable)
            .innerJoin(customerTable, eq(customerTable.id, reportTable.customerId))
            .innerJoin(deviceTable, eq(deviceTable.id, reportTable.deviceId))
            .innerJoin(IssueTable, eq(IssueTable.id, reportTable.issueId))
            .where(eq(reportTable.id, id)),
        db
            .select({ technicianPrice: sql<number>`coalesce(sum(${reportTechnicianTable.price}), 0)::int` })
            .from(reportTechnicianTable)
            .where(eq(reportTechnicianTable.reportId, id)),
    ]);

    if (reportRows.length === 0) {
        res.status(404).json({ message: "Report not found" });
        return;
    }

    const report = reportRows[0];
    const customerName = `${report.customerFirstName} ${report.customerLastName ?? ""}`.trim();
    const { labName, labEmail, labAddress, labPhone, labLogoUrl } = await getLabConfig(req);
    const customerPhoneLabel = formatPhoneLabel(report.customerPhone, report.customerPhoneSecondary);
    const technicianPrice = Number(technicianPriceRows[0]?.technicianPrice ?? 0);
    const totalPrice = Number(report.price ?? 0) + technicianPrice;

    const pdfBuffer = await createReportPdfBuffer({
        id: report.id,
        labName,
        labEmail,
        labAddress,
        labPhone,
        labLogoUrl,
        customerName,
        customerPhone: customerPhoneLabel,
        deviceName: report.deviceName,
        /**
         * Sulla ricevuta va scritto il problema, non l'etichetta con cui il laboratorio lo
         * archivia. Il testo scritto a mano esiste solo con il difetto "Altro", dove
         * l'etichetta non direbbe niente a chi legge; per tutti gli altri difetti vale
         * l'etichetta stessa, che è già una descrizione.
         */
        issueDescription: report.issueDescription?.trim() || report.issueLabel,
        note: report.note ?? "-",
        password: report.password ?? "-",
        dataBackup: report.dataBackup,
        charger: report.charger,
        alerted: report.alerted,
        totalPrice,
        createdAtLabel: formatDateLabel(report.createdAt),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=report-${id}.pdf`);
    res.send(pdfBuffer);
});

/**
 * Il report con il suo tecnico esterno e il compenso (`technicianId` null e `technicianPrice` 0
 * se non ce l'ha).
 *
 * Il tecnico viaggia con il report perché chi apre un report lo vuole sempre: prima il dialogo
 * di modifica e la pagina di dettaglio lo cercavano scaricando l'intera `report_technician`
 * (8000 righe, 376 KB sul database di sviluppo) per usarne una, a ogni apertura.
 */
reportsRouter.get("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const [report, reportTechnician] = await Promise.all([getReportById(id), getReportTechnicianByReportId(id)]);

    if (report.length === 0) {
        res.status(404).json({ message: "Report not found" });
        return;
    }

    res.json({
        ...report[0],
        technicianId: reportTechnician[0]?.technicianId ?? null,
        technicianPrice: reportTechnician[0]?.price ?? 0,
    });
});

reportsRouter.post("/", validate({ body: reportCreateBodySchema }), async (req, res) => {
    // Il vincolo "pagato ⇒ prezzo > 0" è già applicato da `reportCreateBodySchema`, che
    // rifiuta la richiesta prima di arrivare qui: la POST vede solo corpi validi. La PUT
    // invece continua a controllarlo a mano, perché lì il metodo di pagamento e il prezzo
    // possono arrivare da campi diversi (uno dal corpo parziale, l'altro dalla riga
    // esistente) e lo schema non ha modo di vedere la combinazione risultante.
    const paymentMethod = (req.body.paymentMethod ?? "non_paid") as ReportPaymentMethod;
    const price = req.body.price ?? 0;

    if (req.body.closed && req.body.collaboratorId == null) {
        res.status(400).json({ message: "Per chiudere un report è necessario indicare un collaboratore" });
        return;
    }

    const createdReport = await createReport({
        ...req.body,
        paymentMethod,
        price,
    });

    res.status(201).json(createdReport[0]);
});

reportsRouter.put("/:id", validate({ params: idParamsSchema, body: reportUpdateBodySchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const existingReport = await getReportById(id);

    if (existingReport.length === 0) {
        res.status(404).json({ message: "Report not found" });
        return;
    }

    const nextPaymentMethod = (req.body.paymentMethod ?? existingReport[0].paymentMethod) as ReportPaymentMethod;
    const nextPrice = req.body.price ?? existingReport[0].price;

    if (paidPaymentMethods.has(nextPaymentMethod) && nextPrice <= 0) {
        res.status(400).json({
            message: "Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0",
        });
        return;
    }

    // Come per il prezzo qui sopra: la combinazione da validare nasce dall'unione del corpo
    // parziale con la riga esistente, quindi lo schema non può vederla. `collaboratorId` usa
    // `!== undefined` e non `??` perché `null` è un valore significativo ("svuota il campo").
    const nextClosed = req.body.closed ?? existingReport[0].closed;
    const nextCollaboratorId =
        req.body.collaboratorId !== undefined ? req.body.collaboratorId : existingReport[0].collaboratorId;

    if (nextClosed && nextCollaboratorId == null) {
        res.status(400).json({ message: "Per chiudere un report è necessario indicare un collaboratore" });
        return;
    }

    const updatedReport = await updateReportById(id, req.body);

    if (updatedReport.length === 0) {
        res.status(404).json({ message: "Report not found" });
        return;
    }

    res.json(updatedReport[0]);
});

reportsRouter.delete("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const deletedReport = await deleteReportById(id);

    if (deletedReport.length === 0) {
        res.status(404).json({ message: "Report not found" });
        return;
    }

    res.json(deletedReport[0]);
});

export default reportsRouter;
