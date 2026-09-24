import DateRangeFilter from "@/components/filters/date-range-filter";
import FilterSelect, { FILTERS_COMPACT_BREAKPOINT } from "@/components/filters/filter-select";
import MobileFiltersSheet, { MobileFilterField } from "@/components/filters/mobile-filters-sheet";
import RefreshButton from "@/components/refresh-button";
import SearchInput from "@/components/search-input";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ReactNode } from "react";
import { interventionTypeOptions, interventionStatusOptions } from "@/lib/interventions";
import { ArrowUpDown, ListFilter, Tag } from "lucide-react";
import {
    interventionSortOptions,
    type InterventionSortOption,
    type InterventionStatusFilter,
    type InterventionTypeFilter,
} from "./types";

type InterventionsFiltersProps = {
    searchText: string;
    onSearchTextChange: (value: string) => void;
    statusFilter: InterventionStatusFilter;
    onStatusFilterChange: (value: InterventionStatusFilter) => void;
    typeFilter: InterventionTypeFilter;
    onTypeFilterChange: (value: InterventionTypeFilter) => void;
    sortOption: InterventionSortOption;
    onSortOptionChange: (value: InterventionSortOption) => void;
    dateFrom: string | undefined;
    onDateFromChange: (value: string | undefined) => void;
    dateTo: string | undefined;
    onDateToChange: (value: string | undefined) => void;
    onClearDates: () => void;
    onRefresh: () => void | Promise<unknown>;
    isRefreshing?: boolean;
    /** Il menu "Colonne", in fondo alla riga dei filtri. */
    columnsMenu?: ReactNode;
};

const InterventionsFilters = ({
    searchText,
    onSearchTextChange,
    statusFilter,
    onStatusFilterChange,
    typeFilter,
    onTypeFilterChange,
    sortOption,
    onSortOptionChange,
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    onClearDates,
    onRefresh,
    isRefreshing,
    columnsMenu,
}: InterventionsFiltersProps) => {
    const isMobile = useIsMobile(FILTERS_COMPACT_BREAKPOINT);
    const activeFilters = [statusFilter !== "all", typeFilter !== "all", Boolean(dateFrom || dateTo)].filter(
        Boolean
    ).length;

    const statusControl = (variant?: "sheet") => (
        <FilterSelect
            value={statusFilter}
            onValueChange={onStatusFilterChange}
            options={interventionStatusOptions}
            allOption={{ value: "all", label: "Tutti gli stati" }}
            label="Filtra per stato"
            icon={ListFilter}
            variant={variant}
        />
    );
    const typeControl = (variant?: "sheet") => (
        <FilterSelect
            value={typeFilter}
            onValueChange={onTypeFilterChange}
            options={interventionTypeOptions}
            allOption={{ value: "all", label: "Tutti i tipi" }}
            label="Filtra per tipo"
            icon={Tag}
            variant={variant}
        />
    );
    const sortControl = (variant?: "sheet") => (
        <FilterSelect
            value={sortOption}
            onValueChange={onSortOptionChange}
            options={interventionSortOptions}
            label="Ordina per"
            icon={ArrowUpDown}
            variant={variant}
        />
    );

    return (
        // Refresh e ricerca stanno nella loro riga: se i filtri finissero sulla stessa riga
        // della ricerca (come con `flex-wrap` piatto), più filtri ci sono più la ricerca si
        // stringe per farci spazio — qui la sua larghezza dipende solo dal refresh accanto,
        // uguale su ogni pagina a elenco a prescindere da quanti filtri ha. Su mobile i filtri
        // veri e propri stanno dietro il pulsante "Filtri" (vedi `MobileFiltersSheet`).
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 sm:contents">
                <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
                <SearchInput value={searchText} onValueChange={onSearchTextChange} placeholder="Cerca intervento..." />
                {isMobile ? (
                    <MobileFiltersSheet activeCount={activeFilters}>
                        <MobileFilterField label="Stato">{statusControl("sheet")}</MobileFilterField>
                        <MobileFilterField label="Tipo">{typeControl("sheet")}</MobileFilterField>
                        <MobileFilterField label="Ordina per">{sortControl("sheet")}</MobileFilterField>
                        <DateRangeFilter
                            layout="stacked"
                            dateFrom={dateFrom}
                            onDateFromChange={onDateFromChange}
                            dateTo={dateTo}
                            onDateToChange={onDateToChange}
                            onClearDates={onClearDates}
                        />
                    </MobileFiltersSheet>
                ) : null}
            </div>

            {isMobile ? null : (
                <div className="flex flex-wrap items-center gap-2 sm:contents">
                    {statusControl()}
                    {typeControl()}
                    {sortControl()}

                    <DateRangeFilter
                        dateFrom={dateFrom}
                        onDateFromChange={onDateFromChange}
                        dateTo={dateTo}
                        onDateToChange={onDateToChange}
                        onClearDates={onClearDates}
                    />

                    {columnsMenu}
                </div>
            )}
        </div>
    );
};

export default InterventionsFilters;
