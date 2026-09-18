import { z } from "zod";
import {
    createCollaborator,
    deleteCollaboratorById,
    getCollaboratorById,
    listCollaborators,
    updateCollaboratorById,
} from "../db/queries/collaborator";
import { getLabConfig } from "../config/lab";
import { formatPhoneLabel } from "./formatting";
import { createCrudRouter } from "./crudRouter";
import { registerSummaryPrintRoutes } from "./summaryPrint";

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
        registerSummaryPrintRoutes(router, {
            filePrefix: "collaborator",
            notFoundMessage: "Collaborator not found",
            loadContext: loadCollaboratorPrintContext,
            filterFor: (id) => ({ collaboratorId: id }),
        });
    },
});

export default collaboratorsRouter;
