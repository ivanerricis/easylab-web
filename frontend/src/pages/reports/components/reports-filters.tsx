import DateRangeFilter from "@/components/filters/date-range-filter";
import FilterSelect from "@/components/filters/filter-select";
import RefreshButton from "@/components/refresh-button";
import SearchInput from "@/components/search-input";
import { ArrowUpDown, ListFilter } from "lucide-react";
import { reportSortOptions, type ReportSortOption, type ReportVisibilityFilter } from "./types";

// La visibilità non ha un elenco di opzioni altrove: "aperti"/"chiusi" derivano dal
// booleano `closed` del report, non da una colonna con valori propri.
const reportVisibilityOptions: { value: ReportVisibilityFilter; label: string }[] = [
    { value: "open", label: "Report aperti" },
    { value: "closed", label: "Report chiusi" },
];

type ReportsFiltersProps = {
    searchText: string;
    onSearchTextChange: (value: string) => void;
    visibilityFilter: ReportVisibilityFilter;
    onVisibilityFilterChange: (value: ReportVisibilityFilter) => void;
    sortOption: ReportSortOption;
    onSortOptionChange: (value: ReportSortOption) => void;
    dateFrom: string | undefined;
    onDateFromChange: (value: string | undefined) => void;
    dateTo: string | undefined;
    onDateToChange: (value: string | undefined) => void;
    onRefresh: () => void | Promise<unknown>;
    isRefreshing?: boolean;
};

const ReportsFilters = ({
    searchText,
    onSearchTextChange,
    visibilityFilter,
    onVisibilityFilterChange,
    sortOption,
    onSortOptionChange,
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    onRefresh,
    isRefreshing,
}: ReportsFiltersProps) => {
    return (
        // Refresh e ricerca stanno nella loro riga: se i filtri finissero sulla stessa riga
        // della ricerca (come con `flex-wrap` piatto), più filtri ci sono più la ricerca si
        // stringe per farci spazio — qui la sua larghezza dipende solo dal refresh accanto,
        // uguale su ogni pagina a elenco a prescindere da quanti filtri ha.
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 sm:contents">
                <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
                <SearchInput value={searchText} onValueChange={onSearchTextChange} placeholder="Cerca report..." />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:contents">
                <FilterSelect
                    value={visibilityFilter}
                    onValueChange={onVisibilityFilterChange}
                    options={reportVisibilityOptions}
                    allOption={{ value: "all", label: "Tutti i report" }}
                    label="Filtra per stato"
                    icon={ListFilter}
                />

                <FilterSelect
                    value={sortOption}
                    onValueChange={onSortOptionChange}
                    options={reportSortOptions}
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

export default ReportsFilters;
