import type { TechnicianDto } from "@/types/dtos";
import { createEntityApi } from "./client";
import type { EntityListParams } from "./client";

export type TechnicianCreateInput = {
    firstName: string;
    lastName?: string | null;
    phoneNumber?: string | null;
    vatNumber?: string | null;
};

export type TechnicianUpdateInput = Partial<TechnicianCreateInput>;

export type ListTechniciansParams = EntityListParams;

// Le chiamate vengono tutte da `createEntityApi` (vedi `client.ts`): qui restano solo i nomi
// che il resto dell'app già usa.
const techniciansApi = createEntityApi<TechnicianDto, TechnicianCreateInput, TechnicianUpdateInput>("/technicians");

/** Senza parametri l'elenco completo (per i select dei moduli), con i parametri la pagina. */
export const listTechnicians = techniciansApi.list;
/** Un tecnico solo, per id: la sua scheda non ha bisogno dell'elenco intero. */
export const getTechnician = techniciansApi.get;
export const createTechnician = techniciansApi.create;
export const updateTechnician = techniciansApi.update;
export const deleteTechnician = techniciansApi.remove;
