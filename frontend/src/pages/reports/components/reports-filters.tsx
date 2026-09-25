import DateRangeFilter from "@/components/filters/date-range-filter";
import FilterSelect, { FILTERS_COMPACT_BREAKPOINT } from "@/components/filters/filter-select";
import MobileFiltersSheet, { MobileFilterField } from "@/components/filters/mobile-filters-sheet";
import RefreshButton from "@/components/refresh-button";
import SearchInput from "@/components/search-input";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ReactNode } from "react";
import { ArrowUpDown, ListFilter } from "lucide-react";
import { reportVisibilityOptions } from "@/lib/reports";
import { reportSortOptions, type ReportSortOption, type ReportVisibilityFilter } from "./types";

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
    onClearDates: () => void;
    onRefresh: () => void | Promise<unknown>;
    isRefreshing?: boolean;
    /** Il menu "Colonne", in fondo alla riga dei filtri. */
    columnsMenu?: ReactNode;
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
    onClearDates,
    onRefresh,
    isRefreshing,
    columnsMenu,
}: ReportsFiltersProps) => {
    const isMobile = useIsMobile(FILTERS_COMPACT_BREAKPOINT);
    const activeFilters = [visibilityFilter !== "all", Boolean(dateFrom || dateTo)].filter(Boolean).length;

    const visibilityControl = (variant?: "sheet") => (
        <FilterSelect
            value={visibilityFilter}
            onValueChange={onVisibilityFilterChange}
            options={reportVisibilityOptions}
            allOption={{ value: "all", label: "Tutti i report" }}
            label="Filtra per stato"
            icon={ListFilter}
            variant={variant}
        />
    );
    const sortControl = (variant?: "sheet") => (
        <FilterSelect
            value={sortOption}
            onValueChange={onSortOptionChange}
            options={reportSortOptions}
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
                <SearchInput value={searchText} onValueChange={onSearchTextChange} placeholder="Cerca report..." />
                {isMobile ? (
                    <MobileFiltersSheet activeCount={activeFilters}>
                        <MobileFilterField label="Stato">{visibilityControl("sheet")}</MobileFilterField>
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
                    {visibilityControl()}
                    {sortControl()}

                    {/* Date e "Colonne" vanno a capo insieme, e il gruppo si allarga fino al bordo
                        destro con "Colonne" in fondo (`ml-auto`). Prima erano due voci qualunque
                        della riga: a 1440px con la barra laterale aperta mancavano pochi pixel e
                        "Colonne" finiva da solo su una seconda riga, a sinistra. `flex-[1_0_auto]`
                        e non `flex-1`: con base zero il gruppo si farebbe stringere sulla prima
                        riga invece di andare a capo intero. */}
                    <div className="flex flex-[1_0_auto] items-center gap-3">
                        <DateRangeFilter
                            dateFrom={dateFrom}
                            onDateFromChange={onDateFromChange}
                            dateTo={dateTo}
                            onDateToChange={onDateToChange}
                            onClearDates={onClearDates}
                        />

                        {columnsMenu ? <div className="ml-auto hidden sm:block">{columnsMenu}</div> : null}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportsFilters;
