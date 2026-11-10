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
});

export default providersRouter;
