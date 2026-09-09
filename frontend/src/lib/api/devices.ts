import type { DeviceDto } from "@/types/dtos";
import { api, mapEntityTimestamps } from "./client";
import type { EntityWithRawTimestamps } from "./client";
import type { PaginatedResponse } from "./client";

export type DeviceCreateInput = {
    name: string;
};

export type DeviceUpdateInput = Partial<DeviceCreateInput>;

export type ListDevicesParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    /**
     * Annulla la richiesta quando il chiamante la supera con una più recente o smonta la
     * pagina: senza, il server porta comunque a termine una lista che nessuno leggerà.
     * Lo fornisce `usePaginatedRows`.
     */
    signal?: AbortSignal;
};

export function listDevices(): Promise<DeviceDto[]>;
export function listDevices(params: ListDevicesParams): Promise<PaginatedResponse<DeviceDto>>;
export async function listDevices(params?: ListDevicesParams) {
    if (!params) {
        const response = await api.get<EntityWithRawTimestamps<DeviceDto>[]>("/devices");
        return response.data.map((device) => mapEntityTimestamps(device));
    }

    const response = await api.get<PaginatedResponse<EntityWithRawTimestamps<DeviceDto>>>("/devices", {
        params: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 1000,
            search: params.search?.trim() || undefined,
        },
        signal: params.signal,
    });

    const items = response.data.items.map((device) => mapEntityTimestamps(device));

    return {
        ...response.data,
        items,
    };
}

export const createDevice = async (payload: DeviceCreateInput) =>
    mapEntityTimestamps((await api.post<EntityWithRawTimestamps<DeviceDto>>("/devices", payload)).data);

export const updateDevice = async (id: number, payload: DeviceUpdateInput) =>
    mapEntityTimestamps((await api.put<EntityWithRawTimestamps<DeviceDto>>(`/devices/${id}`, payload)).data);

export const deleteDevice = async (id: number) =>
    mapEntityTimestamps((await api.delete<EntityWithRawTimestamps<DeviceDto>>(`/devices/${id}`)).data);
