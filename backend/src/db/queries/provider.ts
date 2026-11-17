import { asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../index";
import { providerTable } from "../schema";
import type { NewProvider, UpdateProvider } from "../types";
import { takeUnpaginated } from "./pagination";
import { containsText, parseIdSearch } from "./search";

type ProviderSortBy = "providerName" | "createdAt";

type ListProvidersParams = {
    page?: number;
    pageSize?: number;
    search?: string;
    /** Arriva da `listQuerySchema` come stringa libera: un valore sconosciuto vale il predefinito. */
    sortBy?: string;
    sortOrder?: "asc" | "desc";
};

export const listProviders = async ({ page, pageSize, search, sortBy, sortOrder = "asc" }: ListProvidersParams) => {
    const trimmedSearch = search?.trim();
    const searchPattern = `%${trimmedSearch ?? ""}%`;
    const idSearch = trimmedSearch ? parseIdSearch(trimmedSearch) : null;
    const searchConditions = trimmedSearch
        ? [
              ...(idSearch != null ? [eq(providerTable.id, idSearch)] : []),
              containsText(providerTable.providerName, searchPattern),
              containsText(providerTable.firstName, searchPattern),
              containsText(providerTable.lastName, searchPattern),
              containsText(providerTable.email, searchPattern),
              containsText(providerTable.phoneNumber, searchPattern),
          ]
        : [];
    const whereClause = searchConditions.length > 0 ? or(...searchConditions) : undefined;
    const sortColumn =
        (sortBy as ProviderSortBy | undefined) === "createdAt" ? providerTable.created_at : providerTable.providerName;
    // L'id come ultimo criterio: con due fornitori creati nello stesso istante la pagina
    // successiva non deve poterli riordinare e ripetere o saltare una riga.
    const baseQuery = db
        .select()
        .from(providerTable)
        .where(whereClause)
        .orderBy(sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn), asc(providerTable.id));

    if (page == null || pageSize == null) {
        return takeUnpaginated(baseQuery, "providers");
    }

    const [items, totalCountRows] = await Promise.all([
        baseQuery.limit(pageSize).offset((page - 1) * pageSize),
        db
            .select({ total: sql<number>`count(*)` })
            .from(providerTable)
            .where(whereClause),
    ]);

    return {
        items,
        totalItems: Number(totalCountRows[0]?.total ?? 0),
    };
};

export const getProviderById = (id: number) => db.select().from(providerTable).where(eq(providerTable.id, id));

export const createProvider = (data: NewProvider) => db.insert(providerTable).values(data).returning();

export const updateProviderById = (id: number, data: UpdateProvider) =>
    db.update(providerTable).set(data).where(eq(providerTable.id, id)).returning();

export const deleteProviderById = (id: number) => db.delete(providerTable).where(eq(providerTable.id, id)).returning();
