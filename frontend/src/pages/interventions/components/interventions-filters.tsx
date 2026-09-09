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
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
            <SearchInput value={searchText} onValueChange={onSearchTextChange} placeholder="Cerca intervento..." />

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
    );
};

export default InterventionsFilters;
