export type PaymentMethod = "non_paid" | "cash" | "card";

export type ReportDto = {
    id: number;
    customerId: number;
    deviceId: number;
    issueId: number;
    collaboratorId: number | null;
    note: string | null;
    password: string | null;
    issueDescription: string | null;
    serviceDescription: string | null;
    dataBackup: boolean;
    charger: boolean;
    alerted: boolean;
    pickedUp: boolean;
    paymentMethod: PaymentMethod;
    price: number;
    customer: string;
    customerPhone: string | null;
    device: string;
    issue: string;
    /** Il collaboratore che ha portato il report: prima il campo si chiamava (a torto)
     * "technician", nome rimasto da quando il laboratorio non distingueva le due figure. */
    collaborator: string;
    /** Il tecnico esterno a cui è affidato il report, se c'è: `null` se non ne ha uno. */
    technicianName: string | null;
    technicianPrice: number;
    totalPrice: number;
    closed: boolean;
    createdAt: string;
    updatedAt: string | null;
};

export type CustomerDto = {
    id: number;
    firstName: string;
    lastName: string | null;
    phoneNumber: string | null;
    phoneNumberSecondary: string | null;
    email: string | null;
    city: string | null;
    createdAt: string;
    updatedAt: string | null;
};

export type CollaboratorDto = {
    id: number;
    firstName: string;
    lastName: string | null;
    phoneNumber: string | null;
    createdAt: string;
    updatedAt: string | null;
};

export type TechnicianDto = {
    id: number;
    firstName: string;
    lastName: string | null;
    phoneNumber: string | null;
    vatNumber: string | null;
    createdAt: string;
    updatedAt: string | null;
};

export type DeviceDto = {
    id: number;
    name: string;
    createdAt: string;
    updatedAt: string | null;
};

export type IssueDto = {
    id: number;
    description: string;
    createdAt: string;
    updatedAt: string | null;
};

export type InterventionType = "material_delivery" | "customer_site" | "remote" | "lab";

export type InterventionStatus = "scheduled" | "in_progress" | "completed";

export type InterventionDto = {
    id: number;
    type: InterventionType;
    /** Assente finché l'intervento è solo scheduled: il lavoro non è ancora stato svolto. */
    description: string | null;
    status: InterventionStatus;
    interventionDate: string;
    startTime: string | null;
    endTime: string | null;
    customerId: number;
    collaboratorId: number;
    /** Il contratto di assistenza a cui sono imputate le ore dell'intervento, se c'è. */
    contractId: number | null;
    customer: string;
    customerPhone: string | null;
    collaborator: string;
    createdAt: string;
    updatedAt: string | null;
};

export type ProviderDto = {
    id: number;
    providerName: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string;
    createdAt: string;
    updatedAt: string | null;
};

export type ContractType = "assistance" | "rental";

/** Lo stato salvato: quello che si sceglie nel modulo. */
export type ContractStatus = "draft" | "active" | "cancelled";

/** Lo stato "reale": un contratto `active` oltre la fine è `expired`, calcolato dal server. */
export type ContractEffectiveStatus = ContractStatus | "expired";

export type ContractTerm = "months_3" | "months_6" | "months_12";

export type AssistanceType = "remote" | "on_site" | "complete" | "full_time";

export type ContractAssistanceDto = {
    assistanceType: AssistanceType;
    /** `null` per il pacchetto full time: ore illimitate. */
    includedHours: number | null;
};

/** Le ore del mese corrente di un contratto di assistenza. */
export type ContractHoursDto = {
    /** "AAAA-MM". */
    month: string;
    usedHours: number;
    includedHours: number | null;
    remainingHours: number | null;
};

export type ContractMonthlyHoursDto = {
    month: string;
    usedHours: number;
};

export type ContractDto = {
    id: number;
    type: ContractType;
    status: ContractStatus;
    effectiveStatus: ContractEffectiveStatus;
    term: ContractTerm;
    device: string;
    note: string | null;
    startDate: string;
    endDate: string;
    customerId: number;
    customerName: string;
    providerId: number;
    providerName: string;
    assistance: ContractAssistanceDto | null;
    /** Solo da `GET /contracts/:id` e solo per l'assistenza: altrove assenti. */
    hours?: ContractHoursDto | null;
    monthlyHours?: ContractMonthlyHoursDto[];
    createdAt: string;
    updatedAt: string | null;
};
