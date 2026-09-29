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

/** Un'opzione di ordinamento come la tengono i select delle liste: "campo:verso". */
export type SortOptionValue<SortBy extends string> = `${SortBy}:${SortDirection}`;

/** I parametri di ordinamento delle API delle liste. */
export type SortParams<SortBy extends string> = { sortBy: SortBy; sortOrder: SortDirection };

const isSortDirection = (value: string): value is SortDirection => value === "asc" || value === "desc";

/**
 * Spezza "campo:verso" nei due parametri che le API delle liste si aspettano. A differenza di
 * `parseSortOption`, che serve alle intestazioni della tabella e accetta qualunque campo, qui il
 * campo si controlla: è quello che parte verso il backend.
 *
 * Prima ogni hook faceva `sortOption.split(":") as [...]`: il cast diceva a TypeScript che il
 * risultato era valido senza controllarlo, quindi un valore imprevisto (un indirizzo scritto a
 * mano, un'opzione tolta dal select ma rimasta in un link salvato) arrivava al backend così
 * com'era. Qui il campo si confronta con quelli ammessi e, se non torna, si usa l'ordinamento
 * predefinito della lista.
 *
 * I campi ammessi sono le chiavi di un oggetto `Record<SortBy, true>` e non un array: così,
 * se all'API si aggiunge un campo di ordinamento, TypeScript segnala l'oggetto da aggiornare
 * invece di lasciarlo scartare in silenzio.
 */
export const parseSortParams = <SortBy extends string>(
    value: string,
    sortFields: Record<SortBy, true>,
    fallback: SortOptionValue<SortBy>
): SortParams<SortBy> => {
    const [sortBy, sortOrder, ...rest] = value.split(":");
    const isSortField = (field: string): field is SortBy => Object.prototype.hasOwnProperty.call(sortFields, field);

    if (
        rest.length === 0 &&
        sortBy !== undefined &&
        isSortField(sortBy) &&
        sortOrder !== undefined &&
        isSortDirection(sortOrder)
    ) {
        return { sortBy, sortOrder };
    }

    const [fallbackSortBy, fallbackSortOrder] = fallback.split(":") as [SortBy, SortDirection];
    return { sortBy: fallbackSortBy, sortOrder: fallbackSortOrder };
};
