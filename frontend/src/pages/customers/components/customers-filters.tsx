import FilterSelect from "@/components/filters/filter-select";
import RefreshButton from "@/components/refresh-button";
import SearchInput from "@/components/search-input";
import type { ReactNode } from "react";
import { ArrowUpDown } from "lucide-react";
import { customerSortOptions, type CustomerSortOption } from "./types";

type CustomersFiltersProps = {
    searchText: string;
    onSearchTextChange: (value: string) => void;
    sortOption: CustomerSortOption;
    onSortOptionChange: (value: CustomerSortOption) => void;
    onRefresh: () => void | Promise<unknown>;
    isRefreshing?: boolean;
    /** Il menu "Colonne", in fondo alla riga dei filtri. */
    columnsMenu?: ReactNode;
};

const CustomersFilters = ({
    searchText,
    onSearchTextChange,
    sortOption,
    onSortOptionChange,
    onRefresh,
    isRefreshing,
    columnsMenu,
}: CustomersFiltersProps) => {
    return (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
            <SearchInput value={searchText} onValueChange={onSearchTextChange} placeholder="Cerca cliente..." />

            <FilterSelect
                value={sortOption}
                onValueChange={onSortOptionChange}
                options={customerSortOptions}
                label="Ordina per"
                icon={ArrowUpDown}
            />

            {columnsMenu}
        </div>
    );
};

export default CustomersFilters;
