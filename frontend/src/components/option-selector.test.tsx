import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ban, CircleCheck } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import OptionSelector from "./option-selector";

const yesNoOptions = [
    { value: true, label: "Sì" },
    { value: false, label: "No" },
];

describe("OptionSelector", () => {
    /** Un campo obbligatorio non deve partire già risposto: con `null` nessuna voce è scelta. */
    it("con valore null nessuna voce è selezionata", () => {
        render(
            <OptionSelector
                value={null}
                onValueChange={vi.fn()}
                options={yesNoOptions}
                ariaLabel="Alimentatore"
                orientation="segmented"
            />
        );

        expect(screen.getByRole("radio", { name: "Sì" })).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "false");
    });

    it("segna la voce scelta e chiama onValueChange con il suo valore", async () => {
        const onValueChange = vi.fn();
        const { rerender } = render(
            <OptionSelector
                value={null}
                onValueChange={onValueChange}
                options={yesNoOptions}
                ariaLabel="Alimentatore"
                orientation="segmented"
            />
        );

        await userEvent.click(screen.getByRole("radio", { name: "No" }));
        expect(onValueChange).toHaveBeenCalledWith(false);

        rerender(
            <OptionSelector
                value={false}
                onValueChange={onValueChange}
                options={yesNoOptions}
                ariaLabel="Alimentatore"
                orientation="segmented"
            />
        );
        expect(screen.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("radio", { name: "Sì" })).toHaveAttribute("aria-checked", "false");
    });

    /** Il gruppo non è focalizzabile da sé: il focus dato per `id` passa a una voce vera. */
    it("il focus dato al gruppo passa alla prima voce, o a quella scelta", () => {
        const { rerender } = render(
            <OptionSelector
                id="charger"
                value={null}
                onValueChange={vi.fn()}
                options={yesNoOptions}
                ariaLabel="Alimentatore"
                orientation="segmented"
            />
        );

        document.getElementById("charger")?.focus();
        expect(screen.getByRole("radio", { name: "Sì" })).toHaveFocus();

        rerender(
            <OptionSelector
                id="charger"
                value={false}
                onValueChange={vi.fn()}
                options={yesNoOptions}
                ariaLabel="Alimentatore"
                orientation="segmented"
            />
        );
        document.getElementById("charger")?.focus();
        expect(screen.getByRole("radio", { name: "No" })).toHaveFocus();
    });

    it("espone invalid e describedBy sul gruppo", () => {
        render(
            <OptionSelector
                id="charger"
                value={null}
                onValueChange={vi.fn()}
                options={yesNoOptions}
                ariaLabel="Alimentatore"
                orientation="segmented"
                invalid
                describedBy="charger-error"
            />
        );

        const group = screen.getByRole("radiogroup", { name: "Alimentatore" });
        expect(group).toHaveAttribute("aria-invalid", "true");
        expect(group).toHaveAttribute("aria-describedby", "charger-error");
    });

    it("stacked con due voci usa due colonne e mantiene le icone", () => {
        render(
            <OptionSelector
                value={false}
                onValueChange={vi.fn()}
                options={[
                    { value: false, label: "Non pagato", icon: Ban },
                    { value: true, label: "Pagato", icon: CircleCheck },
                ]}
                ariaLabel="Pagamento"
                orientation="stacked"
            />
        );

        const group = screen.getByRole("radiogroup", { name: "Pagamento" });
        expect(group.className).toContain("grid-cols-2");
        expect(group.querySelectorAll("svg")).toHaveLength(2);
    });
});
