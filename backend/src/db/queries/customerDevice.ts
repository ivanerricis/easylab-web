import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../index";
import { contractDeviceTable, customerDeviceTable, type CustomerDeviceType } from "../schema";
import type { NewCustomerDevice, UpdateCustomerDevice } from "../types";
import { takeUnpaginated } from "./pagination";
import { containsText, parseIdSearch } from "./search";

type ListCustomerDevicesParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    customerId?: number;
    type?: "all" | CustomerDeviceType;
};

export const listCustomerDevices = async ({
    page,
    pageSize,
    search,
    customerId,
    type = "all",
}: ListCustomerDevicesParams) => {
    const trimmedSearch = search?.trim();
    const pattern = `%${trimmedSearch ?? ""}%`;
    const idSearch = trimmedSearch ? parseIdSearch(trimmedSearch) : null;
    const searchCondition = trimmedSearch
        ? or(
              idSearch != null ? eq(customerDeviceTable.id, idSearch) : undefined,
              containsText(customerDeviceTable.name, pattern),
              containsText(customerDeviceTable.serialNumber, pattern),
              containsText(customerDeviceTable.model, pattern),
              containsText(customerDeviceTable.note, pattern)
          )
        : undefined;
    const conditions = [
        searchCondition,
        customerId ? eq(customerDeviceTable.customerId, customerId) : undefined,
        type !== "all" ? eq(customerDeviceTable.type, type) : undefined,
    ].filter((condition): condition is SQL => condition != null);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    // L'id come ultimo criterio: nomi uguali sono possibili, e la pagina successiva non deve
    // ripetere o saltare un dispositivo.
    const baseQuery = db
        .select()
        .from(customerDeviceTable)
        .where(whereClause)
        .orderBy(asc(customerDeviceTable.name), asc(customerDeviceTable.id));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery, "customer devices");
    }

    const [items, totalCountRows] = await Promise.all([
        baseQuery.limit(pageSize).offset((page - 1) * pageSize),
        db
            .select({ total: sql<number>`count(*)` })
            .from(customerDeviceTable)
            .where(whereClause),
    ]);

    return {
        items,
        totalItems: Number(totalCountRows[0]?.total ?? 0),
    };
};

export const getCustomerDeviceById = (id: number) =>
    db.select().from(customerDeviceTable).where(eq(customerDeviceTable.id, id));

export const createCustomerDevice = (data: NewCustomerDevice) =>
    db.insert(customerDeviceTable).values(data).returning();

// Il cliente non si cambia (lo impone la rotta, e `UpdateCustomerDevice` non lo contiene): i
// collegamenti ai contratti sono vincolati al cliente del dispositivo.
export const updateCustomerDeviceById = (id: number, data: UpdateCustomerDevice) =>
    db.update(customerDeviceTable).set(data).where(eq(customerDeviceTable.id, id)).returning();

export const deleteCustomerDeviceById = (id: number) =>
    db.delete(customerDeviceTable).where(eq(customerDeviceTable.id, id)).returning();

/** Gli id, fra quelli dati, che sono davvero dispositivi di quel cliente: serve a validare un elenco. */
export const findCustomerDeviceIdsOfCustomer = async (customerId: number, ids: number[]) => {
    if (ids.length === 0) {
        return [];
    }

    const rows = await db
        .select({ id: customerDeviceTable.id })
        .from(customerDeviceTable)
        .where(and(eq(customerDeviceTable.customerId, customerId), inArray(customerDeviceTable.id, ids)));

    return rows.map((row) => row.id);
};

/** Gli id dei dispositivi collegati a un contratto. */
export const listContractDeviceIds = async (contractId: number) => {
    const rows = await db
        .select({ id: contractDeviceTable.customerDeviceId })
        .from(contractDeviceTable)
        .where(eq(contractDeviceTable.contractId, contractId));

    return rows.map((row) => row.id);
};

/**
 * I dispositivi di più contratti in una query sola, per la lista: `Map` dal contratto ai suoi
 * dispositivi, in ordine di nome. Sarebbe una query per riga altrimenti.
 */
export const listDevicesOfContracts = async (contractIds: number[]) => {
    const byContract = new Map<number, ContractDevice[]>();

    if (contractIds.length === 0) {
        return byContract;
    }

    const rows = await db
        .select({
            contractId: contractDeviceTable.contractId,
            id: customerDeviceTable.id,
            type: customerDeviceTable.type,
            name: customerDeviceTable.name,
            serialNumber: customerDeviceTable.serialNumber,
            model: customerDeviceTable.model,
        })
        .from(contractDeviceTable)
        .innerJoin(customerDeviceTable, eq(customerDeviceTable.id, contractDeviceTable.customerDeviceId))
        .where(inArray(contractDeviceTable.contractId, contractIds))
        .orderBy(asc(customerDeviceTable.name), asc(customerDeviceTable.id));

    for (const { contractId, ...device } of rows) {
        byContract.set(contractId, [...(byContract.get(contractId) ?? []), device]);
    }

    return byContract;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ContractDevice = Pick<
    typeof customerDeviceTable.$inferSelect,
    "id" | "type" | "name" | "serialNumber" | "model"
>;

/**
 * Toglie dal contratto i dispositivi che non sono in `keepIds` (dentro la transazione di chi la
 * chiama). Applica solo la differenza: un dispositivo che resta non viene toccato, così un
 * intervento che lo indica (chiave composta dell'intervento) non impedisce di salvare il
 * contratto; toglierne uno ancora indicato da un intervento è invece rifiutato dal database.
 */
export const unlinkContractDevices = async (tx: Transaction, contractId: number, keepIds: number[]) => {
    const current = (
        await tx
            .select({ id: contractDeviceTable.customerDeviceId })
            .from(contractDeviceTable)
            .where(eq(contractDeviceTable.contractId, contractId))
    ).map((row) => row.id);
    const toRemove = current.filter((id) => !keepIds.includes(id));

    if (toRemove.length > 0) {
        await tx
            .delete(contractDeviceTable)
            .where(
                and(
                    eq(contractDeviceTable.contractId, contractId),
                    inArray(contractDeviceTable.customerDeviceId, toRemove)
                )
            );
    }
};

/** Collega al contratto i dispositivi dati che non lo sono già: il contratto deve già avere quel `customerId`. */
export const linkContractDevices = async (
    tx: Transaction,
    contractId: number,
    customerId: number,
    deviceIds: number[]
) => {
    const current = (
        await tx
            .select({ id: contractDeviceTable.customerDeviceId })
            .from(contractDeviceTable)
            .where(eq(contractDeviceTable.contractId, contractId))
    ).map((row) => row.id);
    const toAdd = deviceIds.filter((id) => !current.includes(id));

    if (toAdd.length > 0) {
        await tx
            .insert(contractDeviceTable)
            .values(toAdd.map((customerDeviceId) => ({ contractId, customerDeviceId, customerId })));
    }
};
