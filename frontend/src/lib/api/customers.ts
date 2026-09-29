import type { CustomerDto } from "@/types/dtos";
import { api, createEntityApi } from "./client";
import type { EntityListParams } from "./client";

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

export type ListCustomersParams = EntityListParams & {
    sortBy?: CustomerSortBy;
    sortOrder?: "asc" | "desc";
};

// Le chiamate CRUD vengono tutte da `createEntityApi` (vedi `client.ts`): qui restano i nomi
// che il resto dell'app già usa, l'ordinamento e le rotte proprie dei clienti (stampe, CSV).
const customersApi = createEntityApi<CustomerDto, CustomerCreateInput, CustomerUpdateInput, ListCustomersParams>(
    "/customers",
    { extraListParams: ({ sortBy, sortOrder }) => ({ sortBy, sortOrder }) }
);

/**
 * Solo la forma paginata. C'era anche `listCustomers()` senza parametri, che scaricava
 * l'intera tabella: i clienti sono l'unica anagrafica che cresce senza limite, e ormai
 * nessuno la usava più (le schede leggono il cliente con `getCustomer`, i moduli lo cercano
 * con `customerLookup`). Toglierla evita che qualcuno la riprenda per sbaglio.
 */
export const listCustomers = customersApi.listPage;

/**
 * Un cliente solo, per id. Le schede lo cercavano dentro l'elenco completo dei clienti, che
 * senza paginazione si fermava alle prime cinquemila righe: oltre quelle, il nome non si trovava.
 */
export const getCustomer = customersApi.get;
export const createCustomer = customersApi.create;
export const updateCustomer = customersApi.update;
export const deleteCustomer = customersApi.remove;

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

/** Rispetta lo stesso filtro di ricerca visto in lista: esporta quello che c'è a schermo. */
export const getCustomersExportUrl = (params?: { search?: string }) =>
    api.getUri({
        url: "/customers/export.csv",
        params: { search: params?.search?.trim() || undefined },
    });
