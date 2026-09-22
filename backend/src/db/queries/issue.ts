import { desc, eq, or, sql } from "drizzle-orm";
import { db } from "../index";
import { IssueTable } from "../schema";
import type { NewIssue, UpdateIssue } from "../types";
import { isCatchAllIssueDescription, protectedIssueError } from "../../services/issueCatalog";
import { takeUnpaginated } from "./pagination";
import { containsText, parseIdSearch } from "./search";

type ListIssuesParams = {
    page?: number;
    pageSize?: number;
    search?: string;
};

export const listIssues = async ({ page, pageSize, search }: ListIssuesParams) => {
    const trimmedSearch = search?.trim();
    const searchPattern = `%${trimmedSearch ?? ""}%`;
    const idSearch = trimmedSearch ? parseIdSearch(trimmedSearch) : null;
    const searchConditions = trimmedSearch
        ? [
              ...(idSearch != null ? [eq(IssueTable.id, idSearch)] : []),
              containsText(IssueTable.description, searchPattern),
          ]
        : [];
    const whereClause = searchConditions.length > 0 ? or(...searchConditions) : undefined;
    const baseQuery = db.select().from(IssueTable).where(whereClause).orderBy(desc(IssueTable.created_at));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery, "issues");
    }

    const [items, totalCountRows] = await Promise.all([
        baseQuery.limit(pageSize).offset((page - 1) * pageSize),
        db
            .select({ total: sql<number>`count(*)` })
            .from(IssueTable)
            .where(whereClause),
    ]);

    return {
        items,
        totalItems: Number(totalCountRows[0]?.total ?? 0),
    };
};

export const getIssueById = (id: number) => db.select().from(IssueTable).where(eq(IssueTable.id, id));

export const createIssue = (data: NewIssue) => db.insert(IssueTable).values(data).returning();

export const updateIssueById = async (id: number, data: UpdateIssue) => {
    if (typeof data.description === "string") {
        const [existing] = await getIssueById(id);
        if (
            existing &&
            isCatchAllIssueDescription(existing.description) &&
            !isCatchAllIssueDescription(data.description)
        ) {
            throw protectedIssueError();
        }
    }
    return db.update(IssueTable).set(data).where(eq(IssueTable.id, id)).returning();
};

export const deleteIssueById = async (id: number) => {
    const [existing] = await getIssueById(id);
    if (existing && isCatchAllIssueDescription(existing.description)) {
        throw protectedIssueError();
    }
    return db.delete(IssueTable).where(eq(IssueTable.id, id)).returning();
};
