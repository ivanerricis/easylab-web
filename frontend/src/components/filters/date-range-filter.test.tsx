import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import DateRangeFilter from "./date-range-filter";

/** Wrapper con stato reale: il vincolo min/max dipende dai valori correnti dei due campi. */
const Harness = ({ initialFrom, initialTo }: { initialFrom?: string; initialTo?: string }) => {
    const [dateFrom, setDateFrom] = useState<string | undefined>(initialFrom);
    const [dateTo, setDateTo] = useState<string | undefined>(initialTo);

    return (
        <DateRangeFilter
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            onClearDates={() => {
                setDateFrom(undefined);
                setDateTo(undefined);
            }}
        />
    );
};

const startInput = () => screen.getByLabelText("Data di inizio");
const endInput = () => screen.getByLabelText("Data di fine");

describe("DateRangeFilter", () => {
    it("impedisce di scegliere un inizio successivo alla fine, e viceversa", () => {
        render(<Harness initialFrom="2026-03-01" initialTo="2026-03-31" />);

        // È il vincolo che giustifica l'esistenza del componente: prima viveva in due
        // copie identiche, in reports-filters e interventions-filters.
        expect(startInput()).toHaveAttribute("max", "2026-03-31");
        expect(endInput()).toHaveAttribute("min", "2026-03-01");
    });

    it("aggiorna il vincolo quando una delle due date cambia", async () => {
        const user = userEvent.setup();
        render(<Harness />);

        expect(startInput()).not.toHaveAttribute("max");

        await user.type(endInput(), "2026-06-15");

        expect(startInput()).toHaveAttribute("max", "2026-06-15");
    });

    it("mostra il pulsante di pulizia solo quando almeno una data è impostata", () => {
        const { unmount } = render(<Harness />);
        expect(screen.queryByRole("button", { name: "Pulisci date" })).not.toBeInTheDocument();
        unmount();

        render(<Harness initialFrom="2026-03-01" />);
        expect(screen.getByRole("button", { name: "Pulisci date" })).toBeInTheDocument();
    });

    it("azzera entrambe le date, non solo quella impostata", async () => {
        const user = userEvent.setup();
        render(<Harness initialFrom="2026-03-01" initialTo="2026-03-31" />);

        await user.click(screen.getByRole("button", { name: "Pulisci date" }));

        expect(startInput()).toHaveValue("");
        expect(endInput()).toHaveValue("");
        expect(screen.queryByRole("button", { name: "Pulisci date" })).not.toBeInTheDocument();
    });
});
