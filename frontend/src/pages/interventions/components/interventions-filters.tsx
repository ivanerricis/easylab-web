import DateRangeFilter from "@/components/filters/date-range-filter";
import FilterSelect from "@/components/filters/filter-select";
import RefreshButton from "@/components/refresh-button";
import SearchInput from "@/components/search-input";
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
    onRefresh: () => void | Promise<unknown>;
    isRefreshing?: boolean;
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
    onRefresh,
    isRefreshing,
}: InterventionsFiltersProps) => {
    return (
        // Refresh e ricerca stanno nella loro riga: se i filtri finissero sulla stessa riga
        // della ricerca (come con `flex-wrap` piatto), più filtri ci sono più la ricerca si
        // stringe per farci spazio — qui la sua larghezza dipende solo dal refresh accanto,
        // uguale su ogni pagina a elenco a prescindere da quanti filtri ha.
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 sm:contents">
                <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
                <SearchInput value={searchText} onValueChange={onSearchTextChange} placeholder="Cerca intervento..." />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:contents">
                <FilterSelect
                    value={statusFilter}
                    onValueChange={onStatusFilterChange}
                    options={interventionStatusOptions}
                    allOption={{ value: "all", label: "Tutti gli stati" }}
                    label="Filtra per stato"
                    icon={ListFilter}
                />

                <FilterSelect
                    value={typeFilter}
                    onValueChange={onTypeFilterChange}
                    options={interventionTypeOptions}
                    allOption={{ value: "all", label: "Tutti i tipi" }}
                    label="Filtra per tipo"
                    icon={Tag}
                />

                <FilterSelect
                    value={sortOption}
                    onValueChange={onSortOptionChange}
                    options={interventionSortOptions}
                    label="Ordina per"
                    icon={ArrowUpDown}
                />

                <DateRangeFilter
                    dateFrom={dateFrom}
                    onDateFromChange={onDateFromChange}
                    dateTo={dateTo}
                    onDateToChange={onDateToChange}
                />
            </div>
        </div>
    );
};

export default InterventionsFilters;
