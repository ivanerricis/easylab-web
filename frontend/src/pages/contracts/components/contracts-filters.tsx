import FilterSelect, { FILTERS_COMPACT_BREAKPOINT } from "@/components/filters/filter-select";
import MobileFiltersSheet, { MobileFilterField } from "@/components/filters/mobile-filters-sheet";
import RefreshButton from "@/components/refresh-button";
import SearchInput from "@/components/search-input";
import { useIsMobile } from "@/hooks/use-mobile";
import { contractEffectiveStatusOptions, contractTypeOptions } from "@/lib/contracts";
import { ArrowUpDown, ListFilter, Tag } from "lucide-react";
import type { ReactNode } from "react";
import {
    contractSortOptions,
    type ContractSortOption,
    type ContractStatusFilter,
    type ContractTypeFilter,
} from "./types";

type ContractsFiltersProps = {
    searchText: string;
    onSearchTextChange: (value: string) => void;
    typeFilter: ContractTypeFilter;
    onTypeFilterChange: (value: ContractTypeFilter) => void;
    statusFilter: ContractStatusFilter;
    onStatusFilterChange: (value: ContractStatusFilter) => void;
    sortOption: ContractSortOption;
    onSortOptionChange: (value: ContractSortOption) => void;
    onRefresh: () => void | Promise<unknown>;
    isRefreshing?: boolean;
    /** Il menu "Colonne", in fondo alla riga dei filtri. */
    columnsMenu?: ReactNode;
};

const ContractsFilters = ({
    searchText,
    onSearchTextChange,
    typeFilter,
    onTypeFilterChange,
    statusFilter,
    onStatusFilterChange,
    sortOption,
    onSortOptionChange,
    onRefresh,
    isRefreshing,
    columnsMenu,
}: ContractsFiltersProps) => {
    const isMobile = useIsMobile(FILTERS_COMPACT_BREAKPOINT);
    const activeFilters = [typeFilter !== "all", statusFilter !== "all"].filter(Boolean).length;

    const typeControl = (variant?: "sheet") => (
        <FilterSelect
            value={typeFilter}
            onValueChange={onTypeFilterChange}
            options={contractTypeOptions}
            allOption={{ value: "all", label: "Tutti i tipi" }}
            label="Filtra per tipo"
            icon={Tag}
            variant={variant}
        />
    );
    const statusControl = (variant?: "sheet") => (
        <FilterSelect
            value={statusFilter}
            onValueChange={onStatusFilterChange}
            options={contractEffectiveStatusOptions}
            allOption={{ value: "all", label: "Tutti gli stati" }}
            label="Filtra per stato"
            icon={ListFilter}
            variant={variant}
        />
    );
    const sortControl = (variant?: "sheet") => (
        <FilterSelect
            value={sortOption}
            onValueChange={onSortOptionChange}
            options={contractSortOptions}
            label="Ordina per"
            icon={ArrowUpDown}
            variant={variant}
        />
    );

    return (
        // Stessa struttura della barra degli interventi: refresh e ricerca nella loro riga, i filtri
        // veri e propri dietro "Filtri" su mobile (vedi `InterventionsFilters`).
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 sm:contents">
                <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
                <SearchInput value={searchText} onValueChange={onSearchTextChange} placeholder="Cerca contratto..." />
                {isMobile ? (
                    <MobileFiltersSheet activeCount={activeFilters}>
                        <MobileFilterField label="Tipo">{typeControl("sheet")}</MobileFilterField>
                        <MobileFilterField label="Stato">{statusControl("sheet")}</MobileFilterField>
                        <MobileFilterField label="Ordina per">{sortControl("sheet")}</MobileFilterField>
                    </MobileFiltersSheet>
                ) : null}
            </div>

            {isMobile ? null : (
                <div className="flex flex-wrap items-center gap-2 sm:contents">
                    {typeControl()}
                    {statusControl()}
                    {sortControl()}
                    {columnsMenu ? <div className="ml-auto hidden sm:block">{columnsMenu}</div> : null}
                </div>
            )}
        </div>
    );
};

export default ContractsFilters;
