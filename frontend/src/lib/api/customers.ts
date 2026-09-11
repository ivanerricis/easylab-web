import type { CustomerDto } from "@/types/dtos";
import { api, mapEntityTimestamps } from "./client";
import type { EntityWithRawTimestamps } from "./client";
import type { PaginatedResponse } from "./client";

export type CustomerCreateInput = {
    firstName: string;
    lastName?: string | null;
    phoneNumber?: string | null;
    phoneNumberSecondary?: string | null;
    email?: string | null;
    city?: string | null;
};

export type CustomerUpdateInput = Partial<CustomerCreateInput>;

export type CustomerSortBy = "createdAt" | "name";

export type ListCustomersParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: CustomerSortBy;
    sortOrder?: "asc" | "desc";
    /**
     * Annulla la richiesta quando il chiamante la supera con una più recente o smonta la
     * pagina: senza, il server porta comunque a termine una lista che nessuno leggerà.
     * Lo fornisce `usePaginatedRows`.
     */
    signal?: AbortSignal;
};

export function listCustomers(): Promise<CustomerDto[]>;
export function listCustomers(params: ListCustomersParams): Promise<PaginatedResponse<CustomerDto>>;
export async function listCustomers(params?: ListCustomersParams) {
    if (!params) {
        const response = await api.get<EntityWithRawTimestamps<CustomerDto>[]>("/customers");
        return response.data.map((customer) => mapEntityTimestamps(customer));
    }

    const response = await api.get<PaginatedResponse<EntityWithRawTimestamps<CustomerDto>>>("/customers", {
        params: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 1000,
            search: params.search?.trim() || undefined,
            sortBy: params.sortBy,
            sortOrder: params.sortOrder,
        },
        signal: params.signal,
    });

    const items = response.data.items.map((customer) => mapEntityTimestamps(customer));

    return {
        ...response.data,
        items,
    };
}

/**
 * Un cliente solo, per id. Le schede lo cercavano dentro `listCustomers()`, che senza
 * paginazione si ferma alle prime cinquemila righe: oltre quelle, il nome non si trovava.
 */
export const getCustomer = async (id: number) =>
    mapEntityTimestamps((await api.get<EntityWithRawTimestamps<CustomerDto>>(`/customers/${id}`)).data);

export const createCustomer = async (payload: CustomerCreateInput) =>
    mapEntityTimestamps((await api.post<EntityWithRawTimestamps<CustomerDto>>("/customers", payload)).data);

export const updateCustomer = async (id: number, payload: CustomerUpdateInput) =>
    mapEntityTimestamps((await api.put<EntityWithRawTimestamps<CustomerDto>>(`/customers/${id}`, payload)).data);

export const deleteCustomer = async (id: number) =>
    mapEntityTimestamps((await api.delete<EntityWithRawTimestamps<CustomerDto>>(`/customers/${id}`)).data);

export type CustomerPrintRangeParams = {
    dateFrom?: string;
    dateTo?: string;
};

export const getCustomerReportsPrintUrl = (id: number, params?: CustomerPrintRangeParams) =>
    api.getUri({
        url: `/customers/${id}/reports/print`,
        params: {
            dateFrom: params?.dateFrom,
            dateTo: params?.dateTo,
        },
    });

export const getCustomerInterventionsPrintUrl = (id: number, params?: CustomerPrintRangeParams) =>
    api.getUri({
        url: `/customers/${id}/interventions/print`,
        params: {
            dateFrom: params?.dateFrom,
            dateTo: params?.dateTo,
        },
    });
