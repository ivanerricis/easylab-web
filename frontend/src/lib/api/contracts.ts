import type { AssistanceType, ContractDto, ContractEffectiveStatus, ContractStatus, ContractType } from "@/types/dtos";
import { api, createEntityApi } from "./client";
import type { EntityListParams } from "./client";

export type ContractCreateInput = {
    type: ContractType;
    status?: ContractStatus;
    /** Mesi di durata, da 1 a 120. */
    termMonths: number;
    /** Ogni quanti mesi si fattura: obbligatorio per il noleggio, vietato per l'assistenza. */
    billingMonths?: number;
    device: string;
    note?: string | null;
    /** "AAAA-MM-GG"; la fine la calcola il server dalla durata. */
    startDate: string;
    customerId: number;
    providerId: number;
    /** Obbligatorio se e solo se il contratto è di assistenza. */
    assistance?: { assistanceType: AssistanceType; includedHours: number | null };
};

/** Il tipo di un contratto esistente non si cambia: il server lo rifiuta. */
export type ContractUpdateInput = Partial<Omit<ContractCreateInput, "type">>;

export type ContractSortBy = "startDate" | "endDate" | "createdAt" | "customer";

export type ListContractsParams = EntityListParams & {
    type?: "all" | ContractType;
    status?: "all" | ContractEffectiveStatus;
    customerId?: number;
    providerId?: number;
    sortBy?: ContractSortBy;
    sortOrder?: "asc" | "desc";
};

// Anche i contratti passano da `createEntityApi`, che rinomina i timestamp (anche nel dettaglio,
// dove le ore del mese e lo storico mensile viaggiano nello stesso oggetto).
const contractsApi = createEntityApi<ContractDto, ContractCreateInput, ContractUpdateInput, ListContractsParams>(
    "/contracts",
    {
        extraListParams: (params) => ({
            type: params.type,
            status: params.status,
            customerId: params.customerId,
            providerId: params.providerId,
            sortBy: params.sortBy,
            sortOrder: params.sortOrder,
        }),
    }
);

/** Solo la forma paginata: i contratti non hanno un elenco completo senza parametri. */
export const listContracts = contractsApi.listPage;
/** Il dettaglio porta anche `hours` e `monthlyHours` per l'assistenza. */
export const getContract = contractsApi.get;
export const createContract = contractsApi.create;
export const updateContract = contractsApi.update;
export const deleteContract = contractsApi.remove;

/** Indirizzo del PDF: preventivo se il contratto è in bozza, contratto altrimenti (lo decide il server). */
export const getContractPrintUrl = (id: number) => api.getUri({ url: `/contracts/${id}/print` });
