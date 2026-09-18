import { asc, eq, or, sql } from "drizzle-orm";
import { db } from "../index";
import { technicianTable } from "../schema";
import type { NewTechnician, UpdateTechnician } from "../types";
import { takeUnpaginated } from "./pagination";
import { containsText, parseIdSearch } from "./search";

type ListTechniciansParams = {
    page?: number;
    pageSize?: number;
    search?: string;
};

export const listTechnicians = async ({ page, pageSize, search }: ListTechniciansParams) => {
    const trimmedSearch = search?.trim();
    const searchPattern = `%${trimmedSearch ?? ""}%`;
    const idSearch = trimmedSearch ? parseIdSearch(trimmedSearch) : null;
    const searchConditions = trimmedSearch
        ? [
              ...(idSearch != null ? [eq(technicianTable.id, idSearch)] : []),
              containsText(technicianTable.firstName, searchPattern),
              containsText(technicianTable.lastName, searchPattern),
              containsText(technicianTable.phoneNumber, searchPattern),
              containsText(technicianTable.vatNumber, searchPattern),
          ]
        : [];
    const whereClause = searchConditions.length > 0 ? or(...searchConditions) : undefined;
    const baseQuery = db
        .select()
        .from(technicianTable)
        .where(whereClause)
        .orderBy(asc(technicianTable.firstName), asc(technicianTable.lastName));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery, "technicians");
    }

    const [items, totalCountRows] = await Promise.all([
        baseQuery.limit(pageSize).offset((page - 1) * pageSize),
        db
            .select({ total: sql<number>`count(*)` })
            .from(technicianTable)
            .where(whereClause),
    ]);

    return {
        items,
        totalItems: Number(totalCountRows[0]?.total ?? 0),
    };
};

export const getTechnicianById = (id: number) => db.select().from(technicianTable).where(eq(technicianTable.id, id));

export const createTechnician = (data: NewTechnician) => db.insert(technicianTable).values(data).returning();

export const updateTechnicianById = (id: number, data: UpdateTechnician) =>
    db.update(technicianTable).set(data).where(eq(technicianTable.id, id)).returning();

export const deleteTechnicianById = (id: number) =>
    db.delete(technicianTable).where(eq(technicianTable.id, id)).returning();
