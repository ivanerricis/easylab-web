import type { IssueDto } from "@/types/dtos";
import { api, mapEntityTimestamps } from "./client";
import type { EntityWithRawTimestamps } from "./client";
import type { PaginatedResponse } from "./client";

export type IssueCreateInput = {
    description: string;
};

export type IssueUpdateInput = Partial<IssueCreateInput>;

export type ListIssuesParams = {
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

export function listIssues(): Promise<IssueDto[]>;
export function listIssues(params: ListIssuesParams): Promise<PaginatedResponse<IssueDto>>;
export async function listIssues(params?: ListIssuesParams) {
    if (!params) {
        const response = await api.get<EntityWithRawTimestamps<IssueDto>[]>("/issues");
        return response.data.map((issue) => mapEntityTimestamps(issue));
    }

    const response = await api.get<PaginatedResponse<EntityWithRawTimestamps<IssueDto>>>("/issues", {
        params: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 1000,
            search: params.search?.trim() || undefined,
        },
        signal: params.signal,
    });

    const items = response.data.items.map((issue) => mapEntityTimestamps(issue));

    return {
        ...response.data,
        items,
    };
}

export const createIssue = async (payload: IssueCreateInput) =>
    mapEntityTimestamps((await api.post<EntityWithRawTimestamps<IssueDto>>("/issues", payload)).data);

export const updateIssue = async (id: number, payload: IssueUpdateInput) =>
    mapEntityTimestamps((await api.put<EntityWithRawTimestamps<IssueDto>>(`/issues/${id}`, payload)).data);

export const deleteIssue = async (id: number) =>
    mapEntityTimestamps((await api.delete<EntityWithRawTimestamps<IssueDto>>(`/issues/${id}`)).data);
