import type {
    AssistancePackage,
    ContractDto,
    ContractEffectiveStatus,
    ContractPackageDto,
    ContractStatus,
    ContractType,
    SignedContractDto,
} from "@/types/dtos";
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
    /**
     * Obbligatorio se e solo se il contratto è di assistenza. Ore e prezzo li copia il server dal
     * listino; i pacchetti Supporto vogliono `termMonths` a 12.
     */
    assistance?: { package: AssistancePackage };
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

/** Il listino dei pacchetti di assistenza (ore, prezzo, priorità, tipologia), nell'ordine del listino. */
export const listContractPackages = async (signal?: AbortSignal) =>
    (await api.get<ContractPackageDto[]>("/contracts/packages", { signal })).data;

/** Indirizzo del PDF: preventivo se il contratto è in bozza, contratto altrimenti (lo decide il server). */
export const getContractPrintUrl = (id: number) => api.getUri({ url: `/contracts/${id}/print` });

/** Dimensione massima del contratto firmato: la stessa del server (`signedContractMaxBytes`). */
export const signedContractMaxBytes = 15 * 1024 * 1024;

/** Indirizzo del contratto firmato caricato, da aprire in una nuova scheda. */
export const getSignedContractUrl = (id: number) => api.getUri({ url: `/contracts/${id}/signed-contract` });

/** Carica il contratto firmato (PDF), sostituendo quello che c'era. */
export const uploadSignedContract = async (id: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    return (await api.post<SignedContractDto>(`/contracts/${id}/signed-contract`, formData)).data;
};

export const deleteSignedContract = async (id: number) =>
    (await api.delete<{ message: string }>(`/contracts/${id}/signed-contract`)).data;

/** Manda al cliente il contratto firmato; il server risponde con l'indirizzo usato. */
export const sendContractEmail = async (id: number) =>
    (await api.post<{ message: string }>(`/contracts/${id}/send-email`)).data;
