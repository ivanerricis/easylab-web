import { z } from "zod";
import { describeSubject } from "../middleware/auditContext";
import {
    createProvider,
    deleteProviderById,
    getProviderById,
    listProviders,
    updateProviderById,
} from "../db/queries/provider";
import { createCrudRouter } from "./crudRouter";

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
});

export default providersRouter;
