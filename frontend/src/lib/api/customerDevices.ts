import type { CustomerDeviceDto, CustomerDeviceType } from "@/types/dtos";
import { createEntityApi } from "./client";
import type { EntityListParams } from "./client";

export type CustomerDeviceCreateInput = {
    type: CustomerDeviceType;
    name: string;
    serialNumber: string;
    model?: string | null;
    note?: string | null;
    customerId: number;
};

/** Il cliente di un dispositivo non si cambia: il server rifiuta il campo. */
export type CustomerDeviceUpdateInput = Partial<Omit<CustomerDeviceCreateInput, "customerId">>;

export type ListCustomerDevicesParams = EntityListParams & {
    customerId?: number;
    type?: "all" | CustomerDeviceType;
};

// Le chiamate vengono tutte da `createEntityApi` (vedi `client.ts`).
const customerDevicesApi = createEntityApi<
    CustomerDeviceDto,
    CustomerDeviceCreateInput,
    CustomerDeviceUpdateInput,
    ListCustomerDevicesParams
>("/customer-devices", {
    extraListParams: ({ customerId, type }) => ({ customerId, type }),
});

/** Senza parametri l'elenco completo, con i parametri la pagina. Sono i dispositivi dei clienti, non il catalogo dei report. */
export const listCustomerDevices = customerDevicesApi.list;
export const createCustomerDevice = customerDevicesApi.create;
export const updateCustomerDevice = customerDevicesApi.update;
export const deleteCustomerDevice = customerDevicesApi.remove;
