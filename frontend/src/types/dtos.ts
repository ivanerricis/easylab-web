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
    paymentMethod: PaymentMethod;
    price: number;
    customer: string;
    customerPhone: string | null;
    device: string;
    issue: string;
    technician: string;
    internalPrice: number;
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

export type InterventionType = "consegna_materiale" | "intervento_sede" | "intervento_remoto";

export type InterventionStatus = "programmato" | "in_lavorazione" | "completato";

export type InterventionDto = {
    id: number;
    type: InterventionType;
    /** Assente finché l'intervento è solo programmato: il lavoro non è ancora stato svolto. */
    description: string | null;
    status: InterventionStatus;
    interventionDate: string | null;
    startTime: string | null;
    endTime: string | null;
    customerId: number;
    collaboratorId: number;
    customer: string;
    customerPhone: string | null;
    collaborator: string;
    createdAt: string;
    updatedAt: string | null;
};
