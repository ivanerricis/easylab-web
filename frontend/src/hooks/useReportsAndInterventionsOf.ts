import { useState } from "react";
import { listInterventions, listReports } from "@/lib/api";
import type { InterventionDto, ReportDto } from "@/types/dtos";
import type { ReportVisibilityFilter } from "@/pages/reports/components/types";
import type { InterventionStatusFilter } from "@/pages/interventions/components/types";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

type UseReportsAndInterventionsOfParams = {
    /** Di chi sono le due liste: il filtro che il server applica. */
    owner: { customerId: number } | { collaboratorId: number };
    /** Prefisso delle chiavi con cui si ricordano righe per pagina e colonne: `customer-reports`. */
    tableKeyPrefix: "customer" | "collaborator";
    /** "del cliente", "del collaboratore": per i messaggi d'errore. */
    ownerLabel: string;
};

/**
 * I report e gli interventi di un cliente o di un collaboratore, ciascuno con il suo filtro e la
 * sua impaginazione: separate, altrimenti sfogliare i report riporterebbe gli interventi alla
 * prima pagina. Filtro e impaginazione sono del server.
 *
 * Le schede di cliente e collaboratore avevano la stessa sessantina di righe copiate, con solo
 * `customerId` al posto di `collaboratorId`: la modifica del 2026-09-17 ("tab e filtro sulla
 * stessa riga") era andata fatta due volte.
 */
export const useReportsAndInterventionsOf = ({
    owner,
    tableKeyPrefix,
    ownerLabel,
}: UseReportsAndInterventionsOfParams) => {
    const ownerId = "customerId" in owner ? owner.customerId : owner.collaboratorId;
    const [visibilityFilter, setVisibilityFilter] = useState<ReportVisibilityFilter>("all");
    const [interventionStatusFilter, setInterventionStatusFilter] = useState<InterventionStatusFilter>("all");

    const [reportsPageSize, setReportsPageSize] = useTableRowsPerPage(`${tableKeyPrefix}-reports`);
    const { currentPage: reportsPage, setCurrentPage: setReportsPage } = useTablePagination({
        resetDependencies: [visibilityFilter, reportsPageSize],
    });

    const [interventionsPageSize, setInterventionsPageSize] = useTableRowsPerPage(`${tableKeyPrefix}-interventions`);
    const { currentPage: interventionsPage, setCurrentPage: setInterventionsPage } = useTablePagination({
        resetDependencies: [interventionStatusFilter, interventionsPageSize],
    });

    const reports = usePaginatedRows<ReportDto>({
        fetchRows: (signal) =>
            listReports({
                page: reportsPage,
                pageSize: reportsPageSize,
                visibility: visibilityFilter,
                ...owner,
                signal,
            }),
        queryKey: [ownerId, reportsPage, reportsPageSize, visibilityFilter],
        errorMessage: `Impossibile caricare i report ${ownerLabel}`,
        initialLoading: false,
    });

    const interventions = usePaginatedRows<InterventionDto>({
        fetchRows: (signal) =>
            listInterventions({
                page: interventionsPage,
                pageSize: interventionsPageSize,
                status: interventionStatusFilter,
                ...owner,
                signal,
            }),
        queryKey: [ownerId, interventionsPage, interventionsPageSize, interventionStatusFilter],
        errorMessage: `Impossibile caricare gli interventi ${ownerLabel}`,
        initialLoading: false,
    });

    return {
        reports: {
            ...reports,
            filter: visibilityFilter,
            setFilter: setVisibilityFilter,
            page: reportsPage,
            setPage: setReportsPage,
            pageSize: reportsPageSize,
            setPageSize: setReportsPageSize,
        },
        interventions: {
            ...interventions,
            filter: interventionStatusFilter,
            setFilter: setInterventionStatusFilter,
            page: interventionsPage,
            setPage: setInterventionsPage,
            pageSize: interventionsPageSize,
            setPageSize: setInterventionsPageSize,
        },
        isLoading: reports.isLoading || interventions.isLoading,
    };
};

export type ReportsAndInterventionsLists = ReturnType<typeof useReportsAndInterventionsOf>;
