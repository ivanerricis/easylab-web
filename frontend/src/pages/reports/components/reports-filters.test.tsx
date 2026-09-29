import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Il pallino dei filtri attivi esiste solo nella versione compatta, dietro il pulsante "Filtri".
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

import { renderWithProviders } from "@/test/render";
import ReportsFilters from "./reports-filters";
import type { ReportVisibilityFilter } from "./types";

const renderFilters = (visibilityFilter: ReportVisibilityFilter, dateFrom?: string) =>
    renderWithProviders(
        <ReportsFilters
            searchText=""
            onSearchTextChange={vi.fn()}
            visibilityFilter={visibilityFilter}
            onVisibilityFilterChange={vi.fn()}
            sortOption="createdAt:desc"
            onSortOptionChange={vi.fn()}
            dateFrom={dateFrom}
            onDateFromChange={vi.fn()}
            dateTo={undefined}
            onDateToChange={vi.fn()}
            onClearDates={vi.fn()}
            onRefresh={vi.fn()}
        />
    );

describe("ReportsFilters: pallino dei filtri su mobile", () => {
    /** La pagina si apre su "Report aperti": prima chi non aveva toccato niente vedeva "1 attivo". */
    it("non conta niente con i filtri come si apre la pagina", () => {
        renderFilters("open");

        expect(screen.getByRole("button", { name: "Filtri" })).toBeInTheDocument();
    });

    it('conta "Tutti i report", che è uno scostamento dal default', () => {
        renderFilters("all");

        expect(screen.getByRole("button", { name: "Filtri, 1 attivo" })).toBeInTheDocument();
    });

    it("conta stato e date insieme", () => {
        renderFilters("closed", "2026-09-01");

        expect(screen.getByRole("button", { name: "Filtri, 2 attivi" })).toBeInTheDocument();
    });
});
