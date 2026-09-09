import type { TechnicianDto } from "@/types/dtos";
import { api, mapEntityTimestamps } from "./client";
import type { EntityWithRawTimestamps } from "./client";
import type { PaginatedResponse } from "./client";

export type TechnicianCreateInput = {
    firstName: string;
    lastName?: string | null;
    phoneNumber?: string | null;
    vatNumber?: string | null;
};

export type TechnicianUpdateInput = Partial<TechnicianCreateInput>;

export type ListTechniciansParams = {
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

export function listTechnicians(): Promise<TechnicianDto[]>;
export function listTechnicians(params: ListTechniciansParams): Promise<PaginatedResponse<TechnicianDto>>;
export async function listTechnicians(params?: ListTechniciansParams) {
    if (!params) {
        const response = await api.get<EntityWithRawTimestamps<TechnicianDto>[]>("/technicians");
        return response.data.map((technician) => mapEntityTimestamps(technician));
    }

    const response = await api.get<PaginatedResponse<EntityWithRawTimestamps<TechnicianDto>>>("/technicians", {
        params: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 1000,
            search: params.search?.trim() || undefined,
        },
        signal: params.signal,
    });

    const items = response.data.items.map((technician) => mapEntityTimestamps(technician));

    return {
        ...response.data,
        items,
    };
}

export const createTechnician = async (payload: TechnicianCreateInput) =>
    mapEntityTimestamps((await api.post<EntityWithRawTimestamps<TechnicianDto>>("/technicians", payload)).data);

export const updateTechnician = async (id: number, payload: TechnicianUpdateInput) =>
    mapEntityTimestamps((await api.put<EntityWithRawTimestamps<TechnicianDto>>(`/technicians/${id}`, payload)).data);

export const deleteTechnician = async (id: number) =>
    mapEntityTimestamps((await api.delete<EntityWithRawTimestamps<TechnicianDto>>(`/technicians/${id}`)).data);
