import { api } from "./client";
import type { PaymentMethod } from "@/types/dtos";
import type { PaginatedResponse } from "./client";
import type { ReportDto } from "@/types/dtos";

type RawReportDto = Omit<ReportDto, "price" | "internalPrice" | "technicianPrice" | "totalPrice"> & {
    price: number | string;
    internalPrice: number | string;
    technicianPrice: number | string;
    totalPrice: number | string;
};

const normalizeReportDto = (report: RawReportDto): ReportDto => ({
    ...report,
    price: Number(report.price),
    internalPrice: Number(report.internalPrice),
    technicianPrice: Number(report.technicianPrice),
    totalPrice: Number(report.totalPrice),
});

export type ReportEntityDto = {
    id: number;
    note: string | null;
    password: string | null;
    issueDescription: string | null;
    serviceDescription: string | null;
    dataBackup: boolean;
    charger: boolean;
    alerted: boolean;
    closed: boolean;
    price: number;
    paymentMethod: PaymentMethod;
    deviceId: number;
    issueId: number;
    collaboratorId: number | null;
    customerId: number;
    created_at: string;
    updated_at: string | null;
};

export type ReportCreateInput = {
    deviceId: number;
    issueId: number;
    collaboratorId?: number | null;
    customerId: number;
    note?: string | null;
    password?: string | null;
    issueDescription?: string | null;
    serviceDescription?: string | null;
    dataBackup?: boolean;
    charger?: boolean;
    alerted?: boolean;
    closed?: boolean;
    paymentMethod?: PaymentMethod;
    price?: number;
};

export type ReportSortBy = "createdAt" | "customer" | "totalPrice";

export type ListReportsParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    visibility?: "all" | "open" | "closed";
    dateFrom?: string;
    dateTo?: string;
    /** Solo i report di quel collaboratore: lo usa la sua scheda. */
    collaboratorId?: number;
    /** Solo i report di quel cliente: lo usa la sua scheda. */
    customerId?: number;
    /** Solo i report affidati a quel tecnico esterno: lo usa la sua scheda. */
    technicianId?: number;
    sortBy?: ReportSortBy;
    sortOrder?: "asc" | "desc";
    /**
     * Annulla la richiesta quando il chiamante la supera con una più recente o smonta la
     * pagina: senza, il server porta comunque a termine una lista che nessuno leggerà.
     * Lo fornisce `usePaginatedRows`.
     */
    signal?: AbortSignal;
};

export function listReports(): Promise<ReportDto[]>;
export function listReports(params: ListReportsParams): Promise<PaginatedResponse<ReportDto>>;
export async function listReports(params?: ListReportsParams) {
    if (!params) {
        const response = await api.get<RawReportDto[]>("/reports");
        return response.data.map(normalizeReportDto);
    }

    const response = await api.get<PaginatedResponse<RawReportDto>>("/reports", {
        params: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 1000,
            search: params.search?.trim() || undefined,
            visibility: params.visibility,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            collaboratorId: params.collaboratorId,
            customerId: params.customerId,
            technicianId: params.technicianId,
            sortBy: params.sortBy,
            sortOrder: params.sortOrder,
        },
        signal: params.signal,
    });

    const items = response.data.items.map(normalizeReportDto);

    return {
        ...response.data,
        items,
    };
}

/**
 * Il report singolo, con il suo tecnico esterno: `technicianId` è null e `technicianPrice` 0
 * se non ce l'ha. Solo `GET /reports/:id` li restituisce, per questo il tipo è a parte.
 */
export type ReportDetailDto = ReportEntityDto & {
    technicianId: number | null;
    technicianPrice: number;
};

export const getReport = async (id: number) => (await api.get<ReportDetailDto>(`/reports/${id}`)).data;

export const createReport = async (payload: ReportCreateInput) =>
    (await api.post<ReportEntityDto>("/reports", payload)).data;

export const updateReport = async (id: number, payload: Partial<ReportCreateInput>) =>
    (await api.put<ReportEntityDto>(`/reports/${id}`, payload)).data;

export const deleteReport = async (id: number) => (await api.delete<ReportEntityDto>(`/reports/${id}`)).data;

export const getReportPrintUrl = (id: number) => api.getUri({ url: `/reports/${id}/print` });

export type ReportStatsDto = {
    openCount: number;
    closedCount: number;
    monthlyRevenue: number;
    /** Incasso al netto del compenso pagato ai tecnici esterni. */
    monthlyNetRevenue: number;
    series: { monthKey: string; value: number; netValue: number }[];
};

export const getReportStats = async (month?: string) =>
    (await api.get<ReportStatsDto>("/reports/stats", { params: { month } })).data;
