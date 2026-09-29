import { listInterventions } from "@/lib/api";
import type { InterventionSortBy } from "@/lib/api/interventions";
import { parseSortParams } from "@/lib/tableSort";
import type { InterventionDto } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { DEFAULT_INTERVENTION_SORT_OPTION } from "../components/types";
import type { InterventionSortOption, InterventionStatusFilter, InterventionTypeFilter } from "../components/types";

/** I campi per cui l'API degli interventi sa ordinare: vedi `parseSortOption`. */
const INTERVENTION_SORT_FIELDS: Record<InterventionSortBy, true> = {
    createdAt: true,
    interventionDate: true,
    customer: true,
    status: true,
};

type UseInterventionsRowsParams = {
    /** Già rallentato dal chiamante (vedi `useUrlSearchText`): qui si cerca subito. */
    searchText: string;
    statusFilter: InterventionStatusFilter;
    typeFilter: InterventionTypeFilter;
    sortOption: InterventionSortOption;
    dateFrom?: string;
    dateTo?: string;
    currentPage: number;
    pageSize: number;
    /** Chiamato con l'ultima pagina valida quando `currentPage` la supera. Vedi `usePaginatedRows`. */
    onPageOutOfRange?: (lastPage: number) => void;
};

export const useInterventionsRows = ({
    searchText,
    statusFilter,
    typeFilter,
    sortOption,
    dateFrom,
    dateTo,
    currentPage,
    pageSize,
    onPageOutOfRange,
}: UseInterventionsRowsParams) => {
    const { sortBy, sortOrder } = parseSortParams(
        sortOption,
        INTERVENTION_SORT_FIELDS,
        DEFAULT_INTERVENTION_SORT_OPTION
    );
    const params = {
        page: currentPage,
        pageSize,
        search: searchText,
        status: statusFilter,
        type: typeFilter,
        sortBy,
        sortOrder,
        dateFrom,
        dateTo,
    };
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, error, reload } =
        usePaginatedRows<InterventionDto>({
            fetchRows: (signal) => listInterventions({ ...params, signal }),
            // Costruita dagli stessi parametri della richiesta: vedi `useReportsRows`.
            queryKey: Object.values(params),
            errorMessage: "Impossibile caricare gli interventi",
            initialLoading: false,
            page: currentPage,
            onPageOutOfRange,
        });

    return {
        interventionRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        /** L'ultimo caricamento fallito, per la tabella ("Riprova"): vedi `error` in `usePaginatedRows`. */
        loadError: error,
        loadInterventions: reload,
    };
};
