import { listReports } from "@/lib/api";
import type { ReportSortBy } from "@/lib/api/reports";
import { parseSortParams } from "@/lib/tableSort";
import type { ReportDto } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { DEFAULT_REPORT_SORT_OPTION } from "../components/types";
import type { ReportSortOption, ReportVisibilityFilter } from "../components/types";

/** I campi per cui l'API dei report sa ordinare: vedi `parseSortOption`. */
const REPORT_SORT_FIELDS: Record<ReportSortBy, true> = { createdAt: true, customer: true };

type UseReportsRowsParams = {
    /** Già rallentato dal chiamante (vedi `useUrlSearchText`): qui si cerca subito. */
    searchText: string;
    visibilityFilter: ReportVisibilityFilter;
    sortOption: ReportSortOption;
    dateFrom?: string;
    dateTo?: string;
    currentPage: number;
    pageSize: number;
    /** Chiamato con l'ultima pagina valida quando `currentPage` la supera. Vedi `usePaginatedRows`. */
    onPageOutOfRange?: (lastPage: number) => void;
};

export const useReportsRows = ({
    searchText,
    visibilityFilter,
    sortOption,
    dateFrom,
    dateTo,
    currentPage,
    pageSize,
    onPageOutOfRange,
}: UseReportsRowsParams) => {
    const { sortBy, sortOrder } = parseSortParams(sortOption, REPORT_SORT_FIELDS, DEFAULT_REPORT_SORT_OPTION);
    const params = {
        page: currentPage,
        pageSize,
        search: searchText,
        visibility: visibilityFilter,
        sortBy,
        sortOrder,
        dateFrom,
        dateTo,
    };
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, error, reload } =
        usePaginatedRows<ReportDto>({
            fetchRows: (signal) => listReports({ ...params, signal }),
            // `usePaginatedRows` ricarica solo quando cambia `queryKey`: costruirla dagli stessi
            // parametri della richiesta evita che un filtro nuovo, aggiunto alla richiesta ma
            // dimenticato nella chiave (che prima era una copia tenuta a mano), non faccia ripartire
            // il caricamento. L'oggetto ha sempre le stesse chiavi, quindi la lunghezza della lista
            // di dipendenze non cambia tra un render e l'altro.
            queryKey: Object.values(params),
            errorMessage: "Impossibile caricare i report",
            initialLoading: false,
            page: currentPage,
            onPageOutOfRange,
        });

    return {
        reportRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        /** L'ultimo caricamento fallito, per la tabella ("Riprova"): vedi `error` in `usePaginatedRows`. */
        loadError: error,
        loadReports: reload,
    };
};
