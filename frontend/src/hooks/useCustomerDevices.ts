import { listCustomerDevices } from "@/lib/api";
import type { CustomerDeviceDto } from "@/types/dtos";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

/**
 * I dispositivi di un cliente per la quarta tab della sua scheda, con l'impaginazione del server
 * come report, interventi e contratti accanto (vedi `useCustomerContracts`). Per nome.
 */
export const useCustomerDevices = (customerId: number) => {
    const [pageSize, setPageSize] = useTableRowsPerPage("customer-devices");
    const { currentPage: page, setCurrentPage: setPage } = useTablePagination({ resetDependencies: [pageSize] });

    const devices = usePaginatedRows<CustomerDeviceDto>({
        fetchRows: (signal) => listCustomerDevices({ page, pageSize, customerId, signal }),
        queryKey: [customerId, page, pageSize],
        errorMessage: "Impossibile caricare i dispositivi del cliente",
        initialLoading: false,
        page,
        onPageOutOfRange: setPage,
    });

    return { ...devices, page, setPage, pageSize, setPageSize };
};

export type CustomerDevicesList = ReturnType<typeof useCustomerDevices>;
