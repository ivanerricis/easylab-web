import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import MobileFiltersSheet from "./mobile-filters-sheet";

const renderSheet = (activeCount: number) =>
    render(
        <TooltipProvider>
            <MobileFiltersSheet activeCount={activeCount}>
                <div />
            </MobileFiltersSheet>
        </TooltipProvider>
    );

describe("MobileFiltersSheet", () => {
    /** Il pallino si vede soltanto: il numero deve stare nel nome del pulsante, al singolare quando è uno. */
    it.each([
        [0, "Filtri"],
        [1, "Filtri, 1 attivo"],
        [2, "Filtri, 2 attivi"],
    ])('con %i filtri attivi il pulsante si chiama "%s"', (activeCount, name) => {
        renderSheet(activeCount);

        expect(screen.getByRole("button", { name })).toBeInTheDocument();
    });

    it("il pallino mostra il numero, ma lo screen reader lo sente dal nome del pulsante", () => {
        renderSheet(2);
        expect(screen.getByText("2")).toHaveAttribute("aria-hidden", "true");
    });
});
