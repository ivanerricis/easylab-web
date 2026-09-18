import { z } from "zod";
import {
    createCustomer,
    deleteCustomerById,
    getCustomerById,
    listCustomers,
    updateCustomerById,
} from "../db/queries/customer";
import { getLabConfig } from "../config/lab";
import { toCsv } from "../services/csv";
import { exportRowLimit } from "../db/queries/pagination";
import { formatPhoneLabel } from "./formatting";
import { createCrudRouter } from "./crudRouter";
import { registerSummaryPrintRoutes } from "./summaryPrint";
import { validate } from "./validation";

const customerExportQuerySchema = z.object({
    search: z.string().trim().max(255).optional(),
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
        // Prima di "/:id/...": senza, un percorso a un solo segmento come "/export.csv"
        // resterebbe comunque fuori (le due rotte sotto hanno due segmenti), ma l'ordine è
        // la stessa convenzione di tutte le altre rotte letterali di questo router.
        router.get("/export.csv", validate({ query: customerExportQuerySchema }), async (req, res) => {
            const { search } = req.query as unknown as { search?: string };
            const customersResult = await listCustomers({ search, unpaginatedLimit: exportRowLimit });
            const customers = Array.isArray(customersResult) ? customersResult : customersResult.items;

            const csv = toCsv(customers, [
                { header: "ID", value: (customer) => customer.id },
                { header: "Nome", value: (customer) => customer.firstName },
                { header: "Cognome", value: (customer) => customer.lastName },
                { header: "Email", value: (customer) => customer.email },
                { header: "Telefono", value: (customer) => customer.phoneNumber },
                { header: "Telefono secondario", value: (customer) => customer.phoneNumberSecondary },
                { header: "Città", value: (customer) => customer.city },
                { header: "Creato il", value: (customer) => customer.created_at },
            ]);

            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", "attachment; filename=clienti.csv");
            res.send(csv);
        });

        registerSummaryPrintRoutes(router, {
            filePrefix: "customer",
            notFoundMessage: "Customer not found",
            loadContext: loadCustomerPrintContext,
            filterFor: (id) => ({ customerId: id }),
        });
    },
});

export default customersRouter;
