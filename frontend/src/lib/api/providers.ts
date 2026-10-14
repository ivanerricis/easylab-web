import type { ProviderDto } from "@/types/dtos";
import { createEntityApi } from "./client";
import type { EntityListParams } from "./client";

export type ProviderCreateInput = {
    providerName: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    phoneNumber: string;
};

export type ProviderUpdateInput = Partial<ProviderCreateInput>;

export type ProviderSortBy = "providerName" | "createdAt";

export type ListProvidersParams = EntityListParams & {
    sortBy?: ProviderSortBy;
    sortOrder?: "asc" | "desc";
};

// Come i tecnici: tutte le chiamate vengono da `createEntityApi`. L'ordinamento è l'unico
// parametro in più, come per i clienti.
const providersApi = createEntityApi<ProviderDto, ProviderCreateInput, ProviderUpdateInput, ListProvidersParams>(
    "/providers",
    {
        extraListParams: (params) => ({ sortBy: params.sortBy, sortOrder: params.sortOrder }),
    }
);

/** Senza parametri l'elenco completo, con i parametri la pagina. */
export const listProviders = providersApi.list;
export const getProvider = providersApi.get;
export const createProvider = providersApi.create;
export const updateProvider = providersApi.update;
export const deleteProvider = providersApi.remove;
