import { z } from "zod";
import { createDevice, deleteDeviceById, getDeviceById, listDevices, updateDeviceById } from "../db/queries/device";
import { createCrudRouter } from "./crudRouter";

const deviceCreateBodySchema = z
    .object({
        name: z.string().trim().min(1).max(255),
    })
    .strict();

const deviceUpdateBodySchema = deviceCreateBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "È necessario specificare almeno un campo",
});

const devicesRouter = createCrudRouter({
    notFoundMessage: "Dispositivo non trovato",
    createBodySchema: deviceCreateBodySchema,
    updateBodySchema: deviceUpdateBodySchema,
    queries: {
        list: listDevices,
        getById: getDeviceById,
        create: createDevice,
        update: updateDeviceById,
        remove: deleteDeviceById,
    },
});

export default devicesRouter;
