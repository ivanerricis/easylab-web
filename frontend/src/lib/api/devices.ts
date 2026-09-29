import type { DeviceDto } from "@/types/dtos";
import { createEntityApi } from "./client";
import type { EntityListParams } from "./client";

export type DeviceCreateInput = {
    name: string;
};

export type DeviceUpdateInput = Partial<DeviceCreateInput>;

export type ListDevicesParams = EntityListParams;

// Le chiamate vengono tutte da `createEntityApi` (vedi `client.ts`): qui restano solo i nomi
// che il resto dell'app già usa.
const devicesApi = createEntityApi<DeviceDto, DeviceCreateInput, DeviceUpdateInput>("/devices");

/** Senza parametri l'elenco completo (per i select dei moduli), con i parametri la pagina. */
export const listDevices = devicesApi.list;
export const createDevice = devicesApi.create;
export const updateDevice = devicesApi.update;
export const deleteDevice = devicesApi.remove;
