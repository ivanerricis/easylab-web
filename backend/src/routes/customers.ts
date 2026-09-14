import { z } from "zod";
import {
    createCustomer,
    deleteCustomerById,
    getCustomerById,
    listCustomers,
    updateCustomerById,
} from "../db/queries/customer";
import { listReports } from "../db/queries/report";
import { listInterventions } from "../db/queries/intervention";
import { createCustomerReportsPdfBuffer } from "../services/reportPdf";
import { createCustomerInterventionsPdfBuffer } from "../services/interventionPdf";
import { getLabConfig } from "../config/lab";
import { buildDateRangeLabel, formatDateLabel, formatPhoneLabel, formatScheduleLabel } from "./formatting";
import { createCrudRouter, idParamsSchema } from "./crudRouter";
import { validate } from "./validation";

const printRangeQuerySchema = z.object({
    dateFrom: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    dateTo: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
});

const customerBodySchemaBase = z.object({
    email: z.string().trim().email().max(255).nullable().optional(),
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255).nullable().optional(),
    phoneNumber: z.string().trim().min(1).max(20).nullable().optional(),
    phoneNumberSecondary: z.string().trim().min(1).max(20).nullable().optional(),
    city: z.string().trim().min(1).max(255).nullable().optional(),
});

const customerCreateBodySchema = customerBodySchemaBase
    .refine((value) => value.phoneNumber != null || value.phoneNumberSecondary != null, {
        message: "At least one phone number is required",
        path: ["phoneNumber"],
    })
    .strict();

const customerUpdateBodySchema = customerBodySchemaBase
    .partial()
    .refine(
        (value) => {
            if (!("phoneNumber" in value) && !("phoneNumberSecondary" in value)) {
                return true;
            }

            return value.phoneNumber != null || value.phoneNumberSecondary != null;
        },
        {
            message: "At least one phone number is required",
            path: ["phoneNumber"],
        }
    )
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one field is required",
    });

// Intestazione condivisa dai due resoconti PDF del cliente (report e interventi).
const loadCustomerPrintContext = async (id: number) => {
    const customers = await getCustomerById(id);

    if (customers.length === 0) {
        return null;
    }

    const [customer] = customers;

    return {
        customerId: customer.id,
        customerName: `${customer.firstName} ${customer.lastName ?? ""}`.trim(),
        customerPhone: formatPhoneLabel(customer.phoneNumber, customer.phoneNumberSecondary),
        customerEmail: customer.email ?? "-",
        ...(await getLabConfig()),
    };
};

const customersRouter = createCrudRouter({
    notFoundMessage: "Customer not found",
    createBodySchema: customerCreateBodySchema,
    updateBodySchema: customerUpdateBodySchema,
    queries: {
        list: listCustomers,
        getById: getCustomerById,
        create: createCustomer,
        update: updateCustomerById,
        remove: deleteCustomerById,
    },
    extraRoutes: (router) => {
        router.get(
            "/:id/reports/print",
            validate({ params: idParamsSchema, query: printRangeQuerySchema }),
            async (req, res) => {
                const { id } = req.params as unknown as { id: number };
                const { dateFrom, dateTo } = req.query as unknown as {
                    dateFrom?: string;
                    dateTo?: string;
                };
                const context = await loadCustomerPrintContext(id);

                if (!context) {
                    res.status(404).json({ message: "Customer not found" });
                    return;
                }

                const reportsResult = await listReports({ customerId: id, dateFrom, dateTo });
                const reports = Array.isArray(reportsResult) ? reportsResult : reportsResult.items;

                const pdfBuffer = await createCustomerReportsPdfBuffer({
                    ...context,
                    rangeLabel: buildDateRangeLabel(dateFrom, dateTo),
                    reportCount: reports.length,
                    reports: reports.map((report) => ({
                        id: report.id,
                        createdAtLabel: formatDateLabel(report.createdAt),
                        deviceName: report.device,
                        issueDescription: report.issue,
                        closed: report.closed,
                        alerted: report.alerted,
                        paymentMethod: report.paymentMethod as "non_paid" | "cash" | "card",
                        totalPrice: report.totalPrice,
                    })),
                });

                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `inline; filename=customer-${id}-reports.pdf`);
                res.send(pdfBuffer);
            }
        );

        router.get(
            "/:id/interventions/print",
            validate({ params: idParamsSchema, query: printRangeQuerySchema }),
            async (req, res) => {
                const { id } = req.params as unknown as { id: number };
                const { dateFrom, dateTo } = req.query as unknown as {
                    dateFrom?: string;
                    dateTo?: string;
                };
                const context = await loadCustomerPrintContext(id);

                if (!context) {
                    res.status(404).json({ message: "Customer not found" });
                    return;
                }

                const interventionsResult = await listInterventions({ customerId: id, dateFrom, dateTo });
                const interventions = Array.isArray(interventionsResult)
                    ? interventionsResult
                    : interventionsResult.items;

                const pdfBuffer = await createCustomerInterventionsPdfBuffer({
                    ...context,
                    rangeLabel: buildDateRangeLabel(dateFrom, dateTo),
                    interventionCount: interventions.length,
                    interventions: interventions.map((intervention) => ({
                        id: intervention.id,
                        createdAtLabel: formatDateLabel(intervention.createdAt),
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
                res.setHeader("Content-Disposition", `inline; filename=customer-${id}-interventions.pdf`);
                res.send(pdfBuffer);
            }
        );
    },
});

export default customersRouter;
