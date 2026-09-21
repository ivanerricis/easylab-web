import type { InferInsertModel } from "drizzle-orm";
import {
    collaboratorTable,
    customerTable,
    deviceTable,
    interventionTable,
    IssueTable,
    reportTable,
    sessionTable,
    technicianTable,
    userTable,
} from "./schema";

export type NewReport = InferInsertModel<typeof reportTable>;
export type UpdateReport = Partial<Omit<NewReport, "id">>;

export type NewCustomer = InferInsertModel<typeof customerTable>;
export type UpdateCustomer = Partial<Omit<NewCustomer, "id">>;

export type NewCollaborator = InferInsertModel<typeof collaboratorTable>;
export type UpdateCollaborator = Partial<Omit<NewCollaborator, "id">>;

export type NewTechnician = InferInsertModel<typeof technicianTable>;
export type UpdateTechnician = Partial<Omit<NewTechnician, "id">>;

export type NewDevice = InferInsertModel<typeof deviceTable>;
export type UpdateDevice = Partial<Omit<NewDevice, "id">>;

export type NewIssue = InferInsertModel<typeof IssueTable>;
export type UpdateIssue = Partial<Omit<NewIssue, "id">>;

export type NewIntervention = InferInsertModel<typeof interventionTable>;
export type UpdateIntervention = Partial<Omit<NewIntervention, "id">>;

export type NewUser = InferInsertModel<typeof userTable>;
export type NewSession = InferInsertModel<typeof sessionTable>;
