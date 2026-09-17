import { api } from "./client";
import type { PaginatedResponse } from "./client";
import type { InterventionDto, InterventionStatus, InterventionType } from "@/types/dtos";

export type InterventionEntityDto = {
    id: number;
    type: InterventionType;
    description: string | null;
    /** Valorizzato solo per gli interventi in sede o da remoto. */
    problem: string | null;
    /** Annotazioni libere, facoltative per qualunque tipo e stato. */
    note: string | null;
    /** Facoltativo per qualunque tipo di intervento. */
    price: number | null;
    /** A differenza dei report: solo pagato/non pagato, senza distinguere contanti/carta. */
    paid: boolean;
    /** Indipendente da `paid`: dice se va emessa fattura, non se è stato incassato. */
    toInvoice: boolean;
    status: InterventionStatus;
    interventionDate: string | null;
    startTime: string | null;
    endTime: string | null;
    customerId: number;
    collaboratorId: number;
    created_at: string;
    updated_at: string | null;
};

export type InterventionCreateInput = {
    type: InterventionType;
    description?: string | null;
    problem?: string | null;
    note?: string | null;
    price?: number | null;
    paid?: boolean;
    toInvoice?: boolean;
    status?: InterventionStatus;
    customerId: number;
    collaboratorId: number;
    interventionDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
};

export type InterventionSortBy = "createdAt" | "interventionDate" | "customer" | "status";

export type ListInterventionsParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: "all" | InterventionStatus;
    type?: "all" | InterventionType;
    dateFrom?: string;
    dateTo?: string;
    scheduledDate?: string;
    /** Intervallo sulla data dell'intervento; `dateFrom`/`dateTo` filtrano invece la data di creazione. */
    scheduledFrom?: string;
    scheduledTo?: string;
    /** Solo gli interventi assegnati a quel collaboratore: lo usa la sua scheda. */
    collaboratorId?: number;
    /** Solo gli interventi di quel cliente: lo usa la sua pagina degli interventi. */
    customerId?: number;
    sortBy?: InterventionSortBy;
    sortOrder?: "asc" | "desc";
    /**
     * Annulla la richiesta quando il chiamante la supera con una più recente o smonta la
     * pagina: senza, il server porta comunque a termine una lista che nessuno leggerà.
     * Lo fornisce `usePaginatedRows`.
     */
    signal?: AbortSignal;
};

export function listInterventions(): Promise<InterventionDto[]>;
export function listInterventions(params: ListInterventionsParams): Promise<PaginatedResponse<InterventionDto>>;
export async function listInterventions(params?: ListInterventionsParams) {
    if (!params) {
        const response = await api.get<InterventionDto[]>("/interventions");
        return response.data;
    }

    const response = await api.get<PaginatedResponse<InterventionDto>>("/interventions", {
        params: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 1000,
            search: params.search?.trim() || undefined,
            status: params.status,
            type: params.type,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            scheduledDate: params.scheduledDate,
            scheduledFrom: params.scheduledFrom,
            scheduledTo: params.scheduledTo,
            collaboratorId: params.collaboratorId,
            customerId: params.customerId,
            sortBy: params.sortBy,
            sortOrder: params.sortOrder,
        },
        signal: params.signal,
    });

    return response.data;
}

/** L'intervento come lo restituisce `GET /interventions/:id`: con i nomi di cliente e collaboratore. */
export type InterventionDetailDto = InterventionEntityDto & {
    customerName: string | null;
    customerPhone: string | null;
    collaboratorName: string | null;
};

export const getIntervention = async (id: number) =>
    (await api.get<InterventionDetailDto>(`/interventions/${id}`)).data;

export const createIntervention = async (payload: InterventionCreateInput) =>
    (await api.post<InterventionEntityDto>("/interventions", payload)).data;

export const updateIntervention = async (id: number, payload: Partial<InterventionCreateInput>) =>
    (await api.put<InterventionEntityDto>(`/interventions/${id}`, payload)).data;

export const deleteIntervention = async (id: number) =>
    (await api.delete<InterventionEntityDto>(`/interventions/${id}`)).data;

export const getInterventionPrintUrl = (id: number) => api.getUri({ url: `/interventions/${id}/print` });

/** Gli stessi filtri della lista, meno pagina e dimensione pagina: esporta tutto ciò che li passa. */
export type InterventionExportParams = Pick<
    ListInterventionsParams,
    "status" | "type" | "dateFrom" | "dateTo" | "collaboratorId" | "customerId"
>;

export const getInterventionsExportUrl = (params?: InterventionExportParams) =>
    api.getUri({
        url: "/interventions/export.csv",
        params: {
            status: params?.status,
            type: params?.type,
            dateFrom: params?.dateFrom,
            dateTo: params?.dateTo,
            collaboratorId: params?.collaboratorId,
            customerId: params?.customerId,
        },
    });

export const sendInterventionEmail = async (id: number) =>
    (await api.post<{ message: string }>(`/interventions/${id}/send-email`)).data;

export type InterventionStatsDto = {
    programmatoCount: number;
    inLavorazioneCount: number;
    completatoCount: number;
};

export const getInterventionStats = async () => (await api.get<InterventionStatsDto>("/interventions/stats")).data;
