import type { InferInsertModel } from "drizzle-orm";
import {
    assistanceTable,
    collaboratorTable,
    contractTable,
    customerDeviceTable,
    customerTable,
    deviceTable,
    interventionTable,
    IssueTable,
    providerTable,
    reportTable,
    sessionTable,
    technicianTable,
    userTable,
} from "./schema";

export type NewReport = InferInsertModel<typeof reportTable>;
export type UpdateReport = Partial<Omit<NewReport, "id">>;

export type NewCustomer = InferInsertModel<typeof customerTable>;
export type UpdateCustomer = Partial<Omit<NewCustomer, "id">>;

export type NewCustomerDevice = InferInsertModel<typeof customerDeviceTable>;
export type UpdateCustomerDevice = Partial<Omit<NewCustomerDevice, "id" | "customerId">>;

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

export type NewProvider = InferInsertModel<typeof providerTable>;
export type UpdateProvider = Partial<Omit<NewProvider, "id">>;

export type NewContract = InferInsertModel<typeof contractTable>;
export type UpdateContract = Partial<Omit<NewContract, "id">>;

export type NewAssistance = InferInsertModel<typeof assistanceTable>;

export type NewUser = InferInsertModel<typeof userTable>;
export type NewSession = InferInsertModel<typeof sessionTable>;
