import { z } from "zod";
import { describeSubject } from "../middleware/auditContext";
import {
    createCustomerDevice,
    deleteCustomerDeviceById,
    getCustomerDeviceById,
    listCustomerDevices,
    updateCustomerDeviceById,
} from "../db/queries/customerDevice";
import { customerDeviceTypes } from "../db/schema";
import { createCrudRouter, listQuerySchema } from "./crudRouter";

// Stringa vuota = assente: i campi facoltativi del modulo arrivano come "" quando non compilati.
const optionalText = (max: number) =>
    z
        .string()
        .trim()
        .max(max)
        .nullable()
        .optional()
        .transform((value) => (value ? value : null));

const customerDeviceBodyShape = {
    type: z.enum(customerDeviceTypes),
    name: z.string().trim().min(1).max(255),
    serialNumber: z.string().trim().min(1).max(255),
    model: optionalText(255),
    note: optionalText(4000),
};

const customerDeviceCreateBodySchema = z
    .object({ ...customerDeviceBodyShape, customerId: z.coerce.number().int().positive() })
    .strict();

// Il cliente non si cambia: i collegamenti ai contratti sono vincolati al cliente del dispositivo.
// `partial()` dopo il `transform`: un campo facoltativo assente non deve diventare `null` (cancellerebbe il valore).
const customerDeviceUpdateBodySchema = z
    .object({
        type: customerDeviceBodyShape.type.optional(),
        name: customerDeviceBodyShape.name.optional(),
        serialNumber: customerDeviceBodyShape.serialNumber.optional(),
        model: z.string().trim().max(255).nullable().optional(),
        note: z.string().trim().max(4000).nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: "È necessario specificare almeno un campo",
    })
    .transform((value) => ({
        ...value,
        ...("model" in value ? { model: value.model || null } : {}),
        ...("note" in value ? { note: value.note || null } : {}),
    }));

const customerDeviceListQuerySchema = listQuerySchema.extend({
    customerId: z.coerce.number().int().positive().optional(),
    type: z.enum(["all", ...customerDeviceTypes]).optional(),
});

const customerDevicesRouter = createCrudRouter({
    audit: { noun: "dispositivo del cliente", describe: (row) => describeSubject(row.id, row.name) },
    notFoundMessage: "Dispositivo non trovato",
    createBodySchema: customerDeviceCreateBodySchema,
    updateBodySchema: customerDeviceUpdateBodySchema,
    listQuerySchema: customerDeviceListQuerySchema,
    queries: {
        list: (params: z.infer<typeof customerDeviceListQuerySchema>) => listCustomerDevices(params),
        getById: getCustomerDeviceById,
        create: createCustomerDevice,
        update: updateCustomerDeviceById,
        remove: deleteCustomerDeviceById,
    },
});

export default customerDevicesRouter;
