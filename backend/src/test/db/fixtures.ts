import { db } from "../../db";
import {
    collaboratorTable,
    customerTable,
    deviceTable,
    interventionTable,
    IssueTable,
    reportTable,
    reportTechnicianTable,
    technicianTable,
} from "../../db/schema";
import type { NewCollaborator, NewCustomer, NewIntervention, NewReport, NewTechnician } from "../../db/types";

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
        .values({ firstName: `Cliente${next()}`, ...values })
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

/** Un intervento: cliente e collaboratore nuovi se il test non li passa. */
export const insertIntervention = async (values: Partial<NewIntervention> = {}) => {
    const [row] = await db
        .insert(interventionTable)
        .values({
            type: "intervento_sede",
            customerId: values.customerId ?? (await insertCustomer()).id,
            collaboratorId: values.collaboratorId ?? (await insertCollaborator()).id,
            ...values,
        })
        .returning();
    return row;
};
