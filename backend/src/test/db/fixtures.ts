import { db } from "../../db";
import {
    assistanceTable,
    collaboratorTable,
    contractDeviceTable,
    contractTable,
    customerDeviceTable,
    customerTable,
    deviceTable,
    interventionTable,
    IssueTable,
    providerTable,
    reportTable,
    reportTechnicianTable,
    sessionTable,
    technicianTable,
    userTable,
} from "../../db/schema";
import type {
    NewAssistance,
    NewCollaborator,
    NewContract,
    NewCustomer,
    NewCustomerDevice,
    NewIntervention,
    NewProvider,
    NewReport,
    NewSession,
    NewTechnician,
    NewUser,
} from "../../db/types";

/**
 * Righe minime per i test sul database: ogni helper riempie i campi obbligatori e lascia al
 * test solo quelli che contano per il caso. Dispositivi e difetti hanno il nome unico, quindi
 * i nomi predefiniti hanno un suffisso progressivo: in lettere (A, B, … Z, AA), perché una
 * cifra farebbe comparire queste righe nelle ricerche per numero.
 */
let sequence = 0;
const next = () => {
    let value = ++sequence;
    let letters = "";
    while (value > 0) {
        letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
        value = Math.floor((value - 1) / 26);
    }
    return letters;
};

export const insertCustomer = async (values: Partial<NewCustomer> = {}) => {
    const [row] = await db
        .insert(customerTable)
        .values({ firstName: `Cliente${next()}`, phoneNumber: `000${next()}`, ...values })
        .returning();
    return row;
};

export const insertCollaborator = async (values: Partial<NewCollaborator> = {}) => {
    const [row] = await db
        .insert(collaboratorTable)
        .values({ firstName: `Collaboratore${next()}`, ...values })
        .returning();
    return row;
};

export const insertTechnician = async (values: Partial<NewTechnician> = {}) => {
    const [row] = await db
        .insert(technicianTable)
        .values({ firstName: `Tecnico${next()}`, ...values })
        .returning();
    return row;
};

export const insertDevice = async (name = `Dispositivo${next()}`) => {
    const [row] = await db.insert(deviceTable).values({ name }).returning();
    return row;
};

export const insertIssue = async (description = `Difetto${next()}`) => {
    const [row] = await db.insert(IssueTable).values({ description }).returning();
    return row;
};

/** Un report: cliente, dispositivo e difetto nuovi se il test non li passa. */
export const insertReport = async (values: Partial<NewReport> = {}) => {
    const [row] = await db
        .insert(reportTable)
        .values({
            customerId: values.customerId ?? (await insertCustomer()).id,
            deviceId: values.deviceId ?? (await insertDevice()).id,
            issueId: values.issueId ?? (await insertIssue()).id,
            ...values,
        })
        .returning();
    return row;
};

export const assignTechnician = async (reportId: number, technicianId: number, price: number) => {
    await db.insert(reportTechnicianTable).values({ reportId, technicianId, price });
};

/** Un utente: password hash finto, perché i test dell'accesso ne calcolano uno vero a parte. */
export const insertUser = async (values: Partial<NewUser> = {}) => {
    const [row] = await db
        .insert(userTable)
        .values({ username: `utente${next()}`, passwordHash: "hash-non-usato", ...values })
        .returning();
    return row;
};

/** Una sessione: utente nuovo e scadenza fra un'ora se il test non li passa. */
export const insertSession = async (values: Partial<NewSession> = {}) => {
    const [row] = await db
        .insert(sessionTable)
        .values({
            tokenHash: values.tokenHash ?? `hash-sessione-${next()}`,
            userId: values.userId ?? (await insertUser()).id,
            expiresAt: values.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
            ...values,
        })
        .returning();
    return row;
};

/** Un intervento: cliente e collaboratore nuovi se il test non li passa. */
export const insertIntervention = async (values: Partial<NewIntervention> = {}) => {
    const [row] = await db
        .insert(interventionTable)
        .values({
            type: "customer_site",
            interventionDate: "2026-01-01",
            customerId: values.customerId ?? (await insertCustomer()).id,
            collaboratorId: values.collaboratorId ?? (await insertCollaborator()).id,
            ...values,
        })
        .returning();
    return row;
};

/** Un fornitore: nome, email e telefono sono unici, quindi hanno un suffisso in lettere. */
export const insertProvider = async (values: Partial<NewProvider> = {}) => {
    const suffix = next();
    const [row] = await db
        .insert(providerTable)
        .values({
            providerName: `Fornitore${suffix}`,
            email: `fornitore${suffix.toLowerCase()}@example.test`,
            phoneNumber: `Tel${suffix}`,
            ...values,
        })
        .returning();
    return row;
};

/** Un dispositivo del cliente: cliente nuovo e seriale unico se il test non li passa. */
export const insertCustomerDevice = async (values: Partial<NewCustomerDevice> = {}) => {
    const suffix = next();
    const [row] = await db
        .insert(customerDeviceTable)
        .values({
            type: "server",
            name: `Dispositivo cliente ${suffix}`,
            serialNumber: `SN-${suffix}`,
            customerId: values.customerId ?? (await insertCustomer()).id,
            ...values,
        })
        .returning();
    return row;
};

/** Collega un dispositivo a un contratto (il cliente va passato: è parte delle chiavi composte). */
export const linkContractDevice = async (contractId: number, customerDeviceId: number, customerId: number) => {
    await db.insert(contractDeviceTable).values({ contractId, customerDeviceId, customerId });
};

/** Un contratto di noleggio (nessuna riga figlia): cliente e fornitore nuovi se il test non li passa. */
export const insertContract = async (values: Partial<NewContract> = {}) => {
    const [row] = await db
        .insert(contractTable)
        .values({
            type: "rental",
            termMonths: 12,
            billingMonths: values.type === undefined || values.type === "rental" ? 3 : null,
            startDate: "2026-01-01",
            customerId: values.customerId ?? (await insertCustomer()).id,
            providerId: values.providerId ?? (await insertProvider()).id,
            ...values,
        })
        .returning();
    return row;
};

/** Un contratto di assistenza con la sua riga, come li crea la rotta: predefinito Pronti Via 20 (20 ore, 500,00 euro). */
export const insertAssistanceContract = async (
    values: Partial<NewContract> = {},
    assistance: Partial<Pick<NewAssistance, "package" | "includedHours" | "priceCents">> = {}
) => {
    const contract = await insertContract({ ...values, type: "assistance" });
    const [assistanceRow] = await db
        .insert(assistanceTable)
        .values({ package: "ready_20", includedHours: 20, priceCents: 50000, ...assistance, contractId: contract.id })
        .returning();
    return { ...contract, assistance: assistanceRow };
};
