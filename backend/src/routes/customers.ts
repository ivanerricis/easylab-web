import { describeSubject } from "../middleware/auditContext";
import { z } from "zod";
import {
    createCustomer,
    deleteCustomerById,
    getCustomerById,
    listCustomers,
    updateCustomerById,
} from "../db/queries/customer";
import { listDevicesOfContracts } from "../db/queries/customerDevice";
import { formatDeviceLine } from "../services/customerDeviceLabels";
import { listContracts } from "../db/queries/contract";
import { personDisplayName } from "../db/queries/personName";
import { getAppTimeZone, getLabConfig } from "../config/lab";
import { toCsv } from "../services/csv";
import { exportRowLimit } from "../db/queries/pagination";
import { formatDayLabel, formatPhoneLabel } from "./formatting";
import { createCrudRouter, idParamsSchema } from "./crudRouter";
import { createCustomerContractsPdfBuffer } from "../services/contractPdf";
import { registerSummaryPrintRoutes } from "./summaryPrint";
import { validate } from "./validation";

const customerExportQuerySchema = z.object({
    search: z.string().trim().max(255).optional(),
});

const customerBodySchemaBase = z.object({
    email: z.string().trim().email().max(255).nullable().optional(),
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255).nullable().optional(),
    // Obbligatorio come `firstName`, non "almeno uno dei due telefoni": il secondo resta
    // sempre facoltativo. Prima la regola era un `.refine()` sul corpo della richiesta, non
    // sulla riga risultante — una PUT che toccava solo `phoneNumberSecondary` poteva essere
    // rifiutata anche con il primo già salvato. Qui, come campo del tipo base, la stessa
    // trappola non può più capitare: su create è richiesto perché non è `.optional()`, su
    // update (`.partial()`) lo diventa "se presente deve essere valido", proprio come
    // `firstName`. Vedi anche il vincolo `NOT NULL` nella migration
    // 0038_customer_phone_not_null.
    phoneNumber: z.string().trim().min(1).max(20),
    phoneNumberSecondary: z.string().trim().min(1).max(20).nullable().optional(),
    city: z.string().trim().min(1).max(255).nullable().optional(),
});

const customerCreateBodySchema = customerBodySchemaBase.strict();

const customerUpdateBodySchema = customerBodySchemaBase.partial().refine((value) => Object.keys(value).length > 0, {
    message: "È necessario specificare almeno un campo",
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
        customerName: personDisplayName(customer.firstName, customer.lastName),
        customerPhone: formatPhoneLabel(customer.phoneNumber, customer.phoneNumberSecondary),
        customerEmail: customer.email ?? "-",
        ...(await getLabConfig()),
    };
};

const customersRouter = createCrudRouter({
    audit: { noun: "cliente", describe: (row) => describeSubject(row.id, row.firstName, row.lastName) },
    notFoundMessage: "Cliente non trovato",
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

            const csv = toCsv(
                customers,
                [
                    { header: "ID", value: (customer) => customer.id },
                    { header: "Nome", value: (customer) => customer.firstName },
                    { header: "Cognome", value: (customer) => customer.lastName },
                    { header: "Email", value: (customer) => customer.email },
                    { header: "Telefono", value: (customer) => customer.phoneNumber, asText: true },
                    {
                        header: "Telefono secondario",
                        value: (customer) => customer.phoneNumberSecondary,
                        asText: true,
                    },
                    { header: "Città", value: (customer) => customer.city },
                    { header: "Creato il", value: (customer) => customer.created_at },
                ],
                { timeZone: await getAppTimeZone() }
            );

            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", "attachment; filename=clienti.csv");
            res.send(csv);
        });

        // Il resoconto di tutti i contratti del cliente, senza periodo: sono pochi, e uno scaduto
        // o una bozza serve vederli accanto a quelli attivi.
        router.get("/:id/contracts/print", validate({ params: idParamsSchema }), async (req, res) => {
            const { id } = req.params as unknown as { id: number };
            const context = await loadCustomerPrintContext(id);

            if (!context) {
                res.status(404).json({ message: "Cliente non trovato" });
                return;
            }

            const result = await listContracts({ customerId: id, timeZone: await getAppTimeZone() });
            // Senza `page` la lista è sempre un array: il ramo `items` serve solo al tipo.
            const rows = Array.isArray(result) ? result : result.items;
            // Dal più recente, come l'elenco dei contratti.
            const contracts = [...rows].sort((a, b) => b.id - a.id);
            const devicesByContract = await listDevicesOfContracts(contracts.map((contract) => contract.id));

            const pdfBuffer = await createCustomerContractsPdfBuffer({
                ...context,
                contractCount: contracts.length,
                contracts: contracts.map((contract) => ({
                    id: contract.id,
                    type: contract.type,
                    status: contract.effectiveStatus,
                    providerName: contract.providerName,
                    customerName: contract.customerName ?? "-",
                    devices: (devicesByContract.get(contract.id) ?? []).map(formatDeviceLine),
                    assistance:
                        contract.package && contract.includedHours !== null && contract.priceCents !== null
                            ? {
                                  package: contract.package,
                                  includedHours: contract.includedHours,
                                  priceCents: contract.priceCents,
                              }
                            : null,
                    startDateLabel: formatDayLabel(contract.startDate),
                    endDateLabel: formatDayLabel(contract.endDate),
                })),
            });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename=contratti-cliente-${id}.pdf`);
            res.send(pdfBuffer);
        });

        registerSummaryPrintRoutes(router, {
            filePrefix: "customer",
            notFoundMessage: "Cliente non trovato",
            loadContext: loadCustomerPrintContext,
            filterFor: (id) => ({ customerId: id }),
        });
    },
});

export default customersRouter;
