import { z } from "zod";
import { describeSubject } from "../middleware/auditContext";
import {
    createProvider,
    deleteProviderById,
    getProviderById,
    listProviders,
    updateProviderById,
} from "../db/queries/provider";
import { listContracts } from "../db/queries/contract";
import { listDevicesOfContracts } from "../db/queries/customerDevice";
import { formatDeviceLine } from "../services/customerDeviceLabels";
import { personDisplayName } from "../db/queries/personName";
import { getAppTimeZone, getLabConfig } from "../config/lab";
import { createCustomerContractsPdfBuffer } from "../services/contractPdf";
import { createCrudRouter, idParamsSchema } from "./crudRouter";
import { formatDayLabel } from "./formatting";
import { validate } from "./validation";

// Il logo arriva già ridotto dal browser (PNG o JPEG come data URL): il tetto (90.000 caratteri) sta sotto i 100 kB del corpo JSON di express.
const logoDataUrlSchema = z
    .string()
    .max(90_000)
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/, {
        message: "Il logo deve essere un'immagine PNG o JPEG",
    });

// Email e telefono sono obbligatori e unici (vincoli in `schema.ts`): un fornitore va
// contattato per forza, come il primo telefono del cliente. Nome e cognome sono la persona di
// riferimento presso il fornitore, facoltativi.
const providerCreateBodySchema = z
    .object({
        providerName: z.string().trim().min(1).max(255),
        firstName: z.string().trim().min(1).max(255).nullable().optional(),
        lastName: z.string().trim().min(1).max(255).nullable().optional(),
        email: z.string().trim().email().max(255),
        phoneNumber: z.string().trim().min(1).max(20),
        // Obbligatorio alla creazione; chi è nato senza logo lo aggiunge modificando (mai `null`: il logo non si toglie).
        logoDataUrl: logoDataUrlSchema,
    })
    .strict();

const providerUpdateBodySchema = providerCreateBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "È necessario specificare almeno un campo",
});

const providersRouter = createCrudRouter({
    audit: { noun: "fornitore", describe: (row) => describeSubject(row.id, row.providerName) },
    notFoundMessage: "Fornitore non trovato",
    createBodySchema: providerCreateBodySchema,
    updateBodySchema: providerUpdateBodySchema,
    queries: {
        list: listProviders,
        getById: getProviderById,
        create: createProvider,
        update: updateProviderById,
        remove: deleteProviderById,
    },
    extraRoutes: (router) => {
        // Il resoconto di tutti i contratti del fornitore, come quello del cliente
        // (`/customers/:id/contracts/print`): stesso PDF, con il fornitore in testa e il cliente
        // nella colonna dell'altra parte.
        router.get("/:id/contracts/print", validate({ params: idParamsSchema }), async (req, res) => {
            const { id } = req.params as unknown as { id: number };
            const [provider] = await getProviderById(id);

            if (!provider) {
                res.status(404).json({ message: "Fornitore non trovato" });
                return;
            }

            const result = await listContracts({ providerId: id, timeZone: await getAppTimeZone() });
            // Senza `page` la lista è sempre un array: il ramo `items` serve solo al tipo.
            const rows = Array.isArray(result) ? result : result.items;
            // Dal più recente, come l'elenco dei contratti.
            const contracts = [...rows].sort((a, b) => b.id - a.id);
            const devicesByContract = await listDevicesOfContracts(contracts.map((contract) => contract.id));
            const contactName = personDisplayName(provider.firstName ?? "", provider.lastName ?? "").trim();

            const pdfBuffer = await createCustomerContractsPdfBuffer({
                customerId: provider.id,
                customerName: contactName ? `${provider.providerName} (${contactName})` : provider.providerName,
                customerPhone: provider.phoneNumber,
                customerEmail: provider.email,
                subjectLabel: "Fornitore",
                logoDataUrl: provider.logoDataUrl,
                ...(await getLabConfig()),
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
            res.setHeader("Content-Disposition", `inline; filename=contratti-fornitore-${id}.pdf`);
            res.send(pdfBuffer);
        });
    },
});

export default providersRouter;
