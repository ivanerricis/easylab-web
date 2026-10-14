import { useState } from "react";
import { listContracts } from "@/lib/api";
import type { ContractDto, ContractEffectiveStatus } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

export type CustomerContractStatusFilter = "all" | ContractEffectiveStatus;

/**
 * I contratti di un cliente per la terza tab della sua scheda, con filtro per stato e impaginazione
 * del server come report e interventi accanto (vedi `useReportsAndInterventionsOf`): stando nella
 * stessa riga di tab devono comportarsi allo stesso modo. Dal più recente.
 */
export const useCustomerContracts = (customerId: number) => {
    const [statusFilter, setStatusFilter] = useState<CustomerContractStatusFilter>("all");
    const [pageSize, setPageSize] = useTableRowsPerPage("customer-contracts");
    const { currentPage: page, setCurrentPage: setPage } = useTablePagination({
        resetDependencies: [statusFilter, pageSize],
    });

    const contracts = usePaginatedRows<ContractDto>({
        fetchRows: (signal) =>
            listContracts({
                page,
                pageSize,
                customerId,
                status: statusFilter,
                sortBy: "startDate",
                sortOrder: "desc",
                signal,
            }),
        queryKey: [customerId, page, pageSize, statusFilter],
        errorMessage: "Impossibile caricare i contratti del cliente",
        initialLoading: false,
        page,
        onPageOutOfRange: setPage,
    });

    return {
        ...contracts,
        filter: statusFilter,
        setFilter: setStatusFilter,
        page,
        setPage,
        pageSize,
        setPageSize,
    };
};

export type CustomerContractsList = ReturnType<typeof useCustomerContracts>;
