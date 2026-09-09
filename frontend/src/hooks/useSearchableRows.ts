import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import type { PaginatedResponse } from "@/lib/api/client";

type ListParams = {
    page: number;
    pageSize: number;
    search: string;
    signal: AbortSignal;
};

type UseSearchableRowsParams<TRow> = {
    /** La funzione di lista dell'entità: `listDevices`, `listIssues`, ... */
    fetchRows: (params: ListParams) => Promise<PaginatedResponse<TRow>>;
    searchText: string;
    currentPage: number;
    pageSize: number;
    /** Messaggio mostrato se la richiesta fallisce. */
    errorMessage: string;
};

/**
 * Le liste di anagrafica (dispositivi, difetti, tecnici, collaboratori) hanno tutte la
 * stessa forma: testo di ricerca con debounce, paginazione, un messaggio d'errore.
 *
 * Prima ogni entità aveva il proprio hook, identico agli altri a meno del nome della
 * funzione di lista e dei nomi dei campi restituiti (`deviceRows`/`loadDevices` invece di
 * `issueRows`/`loadIssues`). Quella differenza non aggiungeva niente — il chiamante può
 * rinominare in fase di destrutturazione — mentre ogni correzione al comportamento della
 * lista andava replicata su tutte le copie.
 */
export const useSearchableRows = <TRow>({
    fetchRows,
    searchText,
    currentPage,
    pageSize,
    errorMessage,
}: UseSearchableRowsParams<TRow>) => {
    const debouncedSearchText = useDebouncedValue(searchText);

    return usePaginatedRows<TRow>({
        fetchRows: (signal) => fetchRows({ page: currentPage, pageSize, search: debouncedSearchText, signal }),
        queryKey: [currentPage, pageSize, debouncedSearchText],
        errorMessage,
    });
};
