export type SortDirection = "asc" | "desc";

/** L'ordinamento di una lista: il campo `sortBy` dell'API e il verso. */
export type TableSort = { key: string; direction: SortDirection };

/**
 * Le liste tengono l'ordinamento come un'unica stringa "campo:verso" (è il valore del menu
 * "Ordina per" e del parametro `sort` nell'indirizzo): qui si passa da una forma all'altra.
 */
export const parseSortOption = (value: string): TableSort => {
    const [key, direction] = value.split(":");

    return { key, direction: direction === "asc" ? "asc" : "desc" };
};

export const formatSortOption = ({ key, direction }: TableSort) => `${key}:${direction}`;
