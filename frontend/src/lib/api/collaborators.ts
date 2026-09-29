import type { CollaboratorDto } from "@/types/dtos";
import { api, createEntityApi } from "./client";
import type { EntityListParams } from "./client";

export type CollaboratorCreateInput = {
    firstName: string;
    lastName?: string | null;
    phoneNumber?: string | null;
};

export type CollaboratorUpdateInput = Partial<CollaboratorCreateInput>;

export type ListCollaboratorsParams = EntityListParams;

// Le chiamate CRUD vengono tutte da `createEntityApi` (vedi `client.ts`): qui restano i nomi
// che il resto dell'app già usa e le rotte proprie dei collaboratori (le stampe).
const collaboratorsApi = createEntityApi<CollaboratorDto, CollaboratorCreateInput, CollaboratorUpdateInput>(
    "/collaborators"
);

/** Senza parametri l'elenco completo (per i select dei moduli), con i parametri la pagina. */
export const listCollaborators = collaboratorsApi.list;
/** Un collaboratore solo, per id: la sua scheda non ha bisogno dell'elenco intero. */
export const getCollaborator = collaboratorsApi.get;
export const createCollaborator = collaboratorsApi.create;
export const updateCollaborator = collaboratorsApi.update;
export const deleteCollaborator = collaboratorsApi.remove;

/** Stessa forma del resoconto del cliente: un periodo facoltativo sulla data di creazione. */
export const getCollaboratorReportsPrintUrl = (id: number, params?: { dateFrom?: string; dateTo?: string }) =>
    api.getUri({
        url: `/collaborators/${id}/reports/print`,
        params: { dateFrom: params?.dateFrom, dateTo: params?.dateTo },
    });

export const getCollaboratorInterventionsPrintUrl = (id: number, params?: { dateFrom?: string; dateTo?: string }) =>
    api.getUri({
        url: `/collaborators/${id}/interventions/print`,
        params: { dateFrom: params?.dateFrom, dateTo: params?.dateTo },
    });
