import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ContractHoursBar from "./contract-hours-bar";

describe("ContractHoursBar", () => {
    it("mostra le ore usate, la percentuale e quelle rimanenti", () => {
        render(<ContractHoursBar month="2026-10" usedHours={3.5} includedHours={10} />);

        expect(screen.getByText("Ore di ottobre 2026")).toBeInTheDocument();
        expect(screen.getByText("3,5 h di 10 h (35%)")).toBeInTheDocument();
        expect(screen.getByText("Rimanenti: 6,5 h")).toBeInTheDocument();
        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-valuenow", "35");
        expect(bar.firstElementChild).toHaveStyle({ width: "35%" });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("oltre il 100% la barra resta piena e l'eccesso si dice a parole", () => {
        render(<ContractHoursBar month="2026-10" usedHours={12} includedHours={10} />);

        expect(screen.getByText("12 h di 10 h (120%)")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("Superate di 2 h oltre il pacchetto");
        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-valuenow", "100");
        expect(bar.firstElementChild).toHaveStyle({ width: "100%" });
        expect(bar.firstElementChild).toHaveClass("bg-status-red");
    });

    it("da 80% la barra è gialla, esattamente al 100% rossa senza eccesso", () => {
        const { rerender } = render(<ContractHoursBar month="2026-10" usedHours={8} includedHours={10} />);
        expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-status-yellow");

        rerender(<ContractHoursBar month="2026-10" usedHours={10} includedHours={10} />);
        expect(screen.getByRole("progressbar").firstElementChild).toHaveClass("bg-status-red");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("per il full time dice ore illimitate e non disegna la barra", () => {
        render(<ContractHoursBar month="2026-10" usedHours={42} includedHours={null} />);

        expect(screen.getByText("Ore illimitate")).toBeInTheDocument();
        expect(screen.getByText("Utilizzate nel mese: 42 h")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
});
