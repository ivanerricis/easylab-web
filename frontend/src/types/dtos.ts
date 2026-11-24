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
    /** Se per il report va emessa fattura: indipendente da come e se è stato pagato. */
    toInvoice: boolean;
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

/** I tipi di dispositivo del cliente; le etichette italiane stanno in `lib/customerDevices.ts`. */
export type CustomerDeviceType = "pc_desktop" | "server" | "copier" | "firewall" | "cash_register";

/** Un dispositivo del cliente (non il catalogo `DeviceDto` dei report). */
export type CustomerDeviceDto = {
    id: number;
    type: CustomerDeviceType;
    name: string;
    serialNumber: string;
    /** Marca e modello, facoltativi. */
    model: string | null;
    note: string | null;
    customerId: number;
    createdAt: string;
    updatedAt: string | null;
};

/** Il dispositivo come compare dentro un contratto o un intervento: senza note e timestamp. */
export type LinkedDeviceDto = Pick<CustomerDeviceDto, "id" | "type" | "name" | "serialNumber" | "model">;

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
    /** Il logo dei PDF dei contratti (data URL); `null` per i fornitori nati prima che fosse richiesto. */
    logoDataUrl: string | null;
    createdAt: string;
    updatedAt: string | null;
};

export type ContractType = "assistance" | "rental";

/** Lo stato salvato: quello che si sceglie nel modulo. */
export type ContractStatus = "draft" | "active" | "cancelled";

/** Lo stato "reale": un contratto `active` oltre la fine è `expired`, calcolato dal server. */
export type ContractEffectiveStatus = ContractStatus | "expired";

/** Le chiavi del listino dei pacchetti di assistenza (il listino lo serve `GET /contracts/packages`). */
export type AssistancePackage =
    "remote_20" | "remote_40" | "ready_20" | "ready_40" | "ready_60" | "support_base" | "support_plus";

/** `month`: le ore valgono per mese di calendario; `contract`: per tutta la durata (12 mesi). */
export type AssistancePeriod = "month" | "contract";

/** Una voce del listino, come la serve il backend. Il prezzo è IVA esclusa, in centesimi. */
export type ContractPackageDto = {
    key: AssistancePackage;
    name: string;
    includedHours: number;
    /** Al mese per `month`, unico per tutto il contratto per `contract`. */
    priceCents: number;
    period: AssistancePeriod;
    /** 1 = la più alta. */
    priority: number;
    typology: string;
};

/** Il pacchetto di un contratto: ore e prezzo sono la copia fatta alla scelta del pacchetto. */
export type ContractAssistanceDto = Omit<ContractPackageDto, "key"> & {
    package: AssistancePackage;
};

/** Le ore di un contratto di assistenza: del mese corrente o, per il Supporto, di tutto il contratto. */
export type ContractHoursDto = {
    period: AssistancePeriod;
    /** "AAAA-MM"; `null` per il periodo `contract`. */
    month: string | null;
    /** Nel mese, o sul totale del contratto per il periodo `contract`. */
    usedHours: number;
    includedHours: number;
    /** Negativo se si è oltre il pacchetto. */
    remainingHours: number;
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
    /** Durata in mesi, da 1 a 120. */
    termMonths: number;
    /** Ogni quanti mesi si fattura: solo per il noleggio. */
    billingMonths: number | null;
    /** I dispositivi del cliente coperti dal contratto, per nome: zero o più. */
    devices: LinkedDeviceDto[];
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
    /** Il contratto firmato caricato a mano (PDF), senza il file: null finché non c'è. */
    signedContract: SignedContractDto | null;
    createdAt: string;
    updatedAt: string | null;
};

export type SignedContractDto = {
    fileName: string;
    sizeBytes: number;
    uploadedAt: string;
};
