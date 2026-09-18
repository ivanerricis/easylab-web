import { asc, eq, or, sql } from "drizzle-orm";
import { db } from "../index";
import { collaboratorTable } from "../schema";
import type { NewCollaborator, UpdateCollaborator } from "../types";
import { takeUnpaginated } from "./pagination";
import { containsText, parseIdSearch } from "./search";

type ListCollaboratorsParams = {
    page?: number;
    pageSize?: number;
    search?: string;
};

export const listCollaborators = async ({ page, pageSize, search }: ListCollaboratorsParams) => {
    const trimmedSearch = search?.trim();
    const searchPattern = `%${trimmedSearch ?? ""}%`;
    const idSearch = trimmedSearch ? parseIdSearch(trimmedSearch) : null;
    const searchConditions = trimmedSearch
        ? [
              ...(idSearch != null ? [eq(collaboratorTable.id, idSearch)] : []),
              containsText(collaboratorTable.firstName, searchPattern),
              containsText(collaboratorTable.lastName, searchPattern),
              containsText(collaboratorTable.phoneNumber, searchPattern),
          ]
        : [];
    const whereClause = searchConditions.length > 0 ? or(...searchConditions) : undefined;
    const baseQuery = db
        .select()
        .from(collaboratorTable)
        .where(whereClause)
        .orderBy(asc(collaboratorTable.firstName), asc(collaboratorTable.lastName));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery, "collaborators");
    }

    const [items, totalCountRows] = await Promise.all([
        baseQuery.limit(pageSize).offset((page - 1) * pageSize),
        db
            .select({ total: sql<number>`count(*)` })
            .from(collaboratorTable)
            .where(whereClause),
    ]);

    return {
        items,
        totalItems: Number(totalCountRows[0]?.total ?? 0),
    };
};

export const getCollaboratorById = (id: number) =>
    db.select().from(collaboratorTable).where(eq(collaboratorTable.id, id));

export const createCollaborator = (data: NewCollaborator) => db.insert(collaboratorTable).values(data).returning();

export const updateCollaboratorById = (id: number, data: UpdateCollaborator) =>
    db.update(collaboratorTable).set(data).where(eq(collaboratorTable.id, id)).returning();

export const deleteCollaboratorById = (id: number) =>
    db.delete(collaboratorTable).where(eq(collaboratorTable.id, id)).returning();
