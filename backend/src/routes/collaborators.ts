import { z } from "zod";
import {
    createCollaborator,
    deleteCollaboratorById,
    getCollaboratorById,
    listCollaborators,
    updateCollaboratorById,
} from "../db/queries/collaborator";
import { listReports } from "../db/queries/report";
import { listInterventions } from "../db/queries/intervention";
import { createCustomerReportsPdfBuffer } from "../services/reportPdf";
import { createCustomerInterventionsPdfBuffer } from "../services/interventionPdf";
import { getLabConfig } from "../config/lab";
import { buildDateRangeLabel, formatDateLabel, formatPhoneLabel, formatScheduleLabel } from "./formatting";
import { createCrudRouter, idParamsSchema, printRangeQuerySchema } from "./crudRouter";
import { validate } from "./validation";

const collaboratorCreateBodySchema = z
    .object({
        firstName: z.string().trim().min(1).max(255),
        lastName: z.string().trim().min(1).max(255).nullable().optional(),
        phoneNumber: z.string().trim().min(1).max(20).nullable().optional(),
    })
    .strict();

const collaboratorUpdateBodySchema = collaboratorCreateBodySchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one field is required",
    });

/**
 * Intestazione dei due resoconti PDF del collaboratore. Riusa il riepilogo del cliente
 * (`subjectLabel` cambia le etichette), senza la riga dell'email, che il collaboratore non ha,
 * e con la colonna "Cliente", perché le voci sono di clienti diversi.
 */
const loadCollaboratorPrintContext = async (id: number) => {
    const collaborators = await getCollaboratorById(id);

    if (collaborators.length === 0) {
        return null;
    }

    const [collaborator] = collaborators;

    return {
        customerId: collaborator.id,
        customerName: `${collaborator.firstName} ${collaborator.lastName ?? ""}`.trim(),
        customerPhone: formatPhoneLabel(collaborator.phoneNumber),
        subjectLabel: "Collaboratore",
        showCustomerColumn: true,
        ...(await getLabConfig()),
    };
};

const collaboratorsRouter = createCrudRouter({
    notFoundMessage: "Collaborator not found",
    createBodySchema: collaboratorCreateBodySchema,
    updateBodySchema: collaboratorUpdateBodySchema,
    queries: {
        list: listCollaborators,
        getById: getCollaboratorById,
        create: createCollaborator,
        update: updateCollaboratorById,
        remove: deleteCollaboratorById,
    },
    extraRoutes: (router) => {
        router.get(
            "/:id/reports/print",
            validate({ params: idParamsSchema, query: printRangeQuerySchema }),
            async (req, res) => {
                const { id } = req.params as unknown as { id: number };
                const { dateFrom, dateTo } = req.query as unknown as { dateFrom?: string; dateTo?: string };
                const context = await loadCollaboratorPrintContext(id);

                if (!context) {
                    res.status(404).json({ message: "Collaborator not found" });
                    return;
                }

                const reportsResult = await listReports({
                    collaboratorId: id,
                    dateFrom,
                    dateTo,
                    timeZone: context.timeZone,
                });
                const reports = Array.isArray(reportsResult) ? reportsResult : reportsResult.items;

                const pdfBuffer = await createCustomerReportsPdfBuffer({
                    ...context,
                    rangeLabel: buildDateRangeLabel(dateFrom, dateTo),
                    reportCount: reports.length,
                    reports: reports.map((report) => ({
                        id: report.id,
                        createdAtLabel: formatDateLabel(report.createdAt, context.timeZone),
                        customerName: report.customer,
                        deviceName: report.device,
                        issueDescription: report.issue,
                        closed: report.closed,
                        alerted: report.alerted,
                        paymentMethod: report.paymentMethod as "non_paid" | "cash" | "card",
                        totalPrice: report.totalPrice,
                    })),
                });

                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `inline; filename=collaborator-${id}-reports.pdf`);
                res.send(pdfBuffer);
            }
        );

        router.get(
            "/:id/interventions/print",
            validate({ params: idParamsSchema, query: printRangeQuerySchema }),
            async (req, res) => {
                const { id } = req.params as unknown as { id: number };
                const { dateFrom, dateTo } = req.query as unknown as { dateFrom?: string; dateTo?: string };
                const context = await loadCollaboratorPrintContext(id);

                if (!context) {
                    res.status(404).json({ message: "Collaborator not found" });
                    return;
                }

                const interventionsResult = await listInterventions({
                    collaboratorId: id,
                    dateFrom,
                    dateTo,
                    timeZone: context.timeZone,
                });
                const interventions = Array.isArray(interventionsResult)
                    ? interventionsResult
                    : interventionsResult.items;

                const pdfBuffer = await createCustomerInterventionsPdfBuffer({
                    ...context,
                    rangeLabel: buildDateRangeLabel(dateFrom, dateTo),
                    interventionCount: interventions.length,
                    interventions: interventions.map((intervention) => ({
                        id: intervention.id,
                        createdAtLabel: formatDateLabel(intervention.createdAt, context.timeZone),
                        customerName: intervention.customer,
                        type: intervention.type as "consegna_materiale" | "intervento_sede" | "intervento_remoto",
                        status: intervention.status as "programmato" | "in_lavorazione" | "completato",
                        description: intervention.description,
                        scheduleLabel: formatScheduleLabel(
                            intervention.interventionDate,
                            intervention.startTime,
                            intervention.endTime
                        ),
                    })),
                });

                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `inline; filename=collaborator-${id}-interventions.pdf`);
                res.send(pdfBuffer);
            }
        );
    },
});

export default collaboratorsRouter;
