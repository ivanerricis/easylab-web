import { z } from "zod";
import {
    createTechnician,
    deleteTechnicianById,
    getTechnicianById,
    listTechnicians,
    updateTechnicianById,
} from "../db/queries/technician";
import { createCrudRouter } from "./crudRouter";

const technicianCreateBodySchema = z
    .object({
        firstName: z.string().trim().min(1).max(255),
        lastName: z.string().trim().min(1).max(255).nullable().optional(),
        phoneNumber: z.string().trim().min(1).max(20).nullable().optional(),
        vatNumber: z.string().trim().min(1).max(20).nullable().optional(),
    })
    .strict();

const technicianUpdateBodySchema = technicianCreateBodySchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
        message: "È necessario specificare almeno un campo",
    });

const techniciansRouter = createCrudRouter({
    notFoundMessage: "Tecnico non trovato",
    createBodySchema: technicianCreateBodySchema,
    updateBodySchema: technicianUpdateBodySchema,
    queries: {
        list: listTechnicians,
        getById: getTechnicianById,
        create: createTechnician,
        update: updateTechnicianById,
        remove: deleteTechnicianById,
    },
});

export default techniciansRouter;
