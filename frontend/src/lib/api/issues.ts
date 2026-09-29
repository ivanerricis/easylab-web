import type { IssueDto } from "@/types/dtos";
import { createEntityApi } from "./client";
import type { EntityListParams } from "./client";

export type IssueCreateInput = {
    description: string;
};

export type IssueUpdateInput = Partial<IssueCreateInput>;

export type ListIssuesParams = EntityListParams;

// Le chiamate vengono tutte da `createEntityApi` (vedi `client.ts`): qui restano solo i nomi
// che il resto dell'app già usa.
const issuesApi = createEntityApi<IssueDto, IssueCreateInput, IssueUpdateInput>("/issues");

/** Senza parametri l'elenco completo (per i select dei moduli), con i parametri la pagina. */
export const listIssues = issuesApi.list;
export const createIssue = issuesApi.create;
export const updateIssue = issuesApi.update;
export const deleteIssue = issuesApi.remove;
