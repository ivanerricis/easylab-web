import { listContracts } from "@/lib/api";
import type { ContractSortBy } from "@/lib/api/contracts";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { parseSortParams } from "@/lib/tableSort";
import type { ContractDto } from "@/types/dtos";
import {
    DEFAULT_CONTRACT_SORT_OPTION,
    type ContractSortOption,
    type ContractStatusFilter,
    type ContractTypeFilter,
} from "../components/types";

/** I campi per cui l'API dei contratti sa ordinare: vedi `parseSortParams`. */
const CONTRACT_SORT_FIELDS: Record<ContractSortBy, true> = {
    startDate: true,
    endDate: true,
    createdAt: true,
    customer: true,
};

type UseContractsRowsParams = {
    /** Già rallentato dal chiamante (vedi `useUrlSearchText`): qui si cerca subito. */
    searchText: string;
    typeFilter: ContractTypeFilter;
    statusFilter: ContractStatusFilter;
    sortOption: ContractSortOption;
    currentPage: number;
    pageSize: number;
    /** Chiamato con l'ultima pagina valida quando `currentPage` la supera. Vedi `usePaginatedRows`. */
    onPageOutOfRange?: (lastPage: number) => void;
};

export const useContractsRows = ({
    searchText,
    typeFilter,
    statusFilter,
    sortOption,
    currentPage,
    pageSize,
    onPageOutOfRange,
}: UseContractsRowsParams) => {
    const { sortBy, sortOrder } = parseSortParams(sortOption, CONTRACT_SORT_FIELDS, DEFAULT_CONTRACT_SORT_OPTION);
    const params = {
        page: currentPage,
        pageSize,
        search: searchText,
        type: typeFilter,
        status: statusFilter,
        sortBy,
        sortOrder,
    };
    const { rows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, error, reload } =
        usePaginatedRows<ContractDto>({
            fetchRows: (signal) => listContracts({ ...params, signal }),
            // Costruita dagli stessi parametri della richiesta: vedi `useInterventionsRows`.
            queryKey: Object.values(params),
            errorMessage: "Impossibile caricare i contratti",
            initialLoading: false,
            page: currentPage,
            onPageOutOfRange,
        });

    return {
        contractRows: rows,
        totalItems,
        totalPages,
        isLoading,
        isInitialLoading,
        isRefetching,
        loadError: error,
        loadContracts: reload,
    };
};
