import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import FormField from "./form-field";
import PaymentMethodSelector from "./payment-method-selector";
import SearchInput from "./search-input";
import { fieldProps } from "@/lib/formField";
import type { PaymentMethod } from "@/types/dtos";

describe("FormField", () => {
    it("lega etichetta, controllo e messaggio d'errore", () => {
        render(
            <FormField id="firstName" label="Nome" required error="Il nome è obbligatorio">
                <input {...fieldProps("firstName", { error: "Il nome è obbligatorio", required: true })} />
            </FormField>
        );

        const input = screen.getByLabelText(/Nome/);
        expect(input).toBeInvalid();
        // L'errore viene letto insieme al campo, non come un paragrafo qualsiasi lì vicino.
        expect(input).toHaveAccessibleDescription("Il nome è obbligatorio");
        expect(screen.getByRole("alert")).toHaveTextContent("Il nome è obbligatorio");
    });

    it("annuncia l'obbligatorietà agli screen reader", () => {
        render(
            <FormField id="firstName" label="Nome" required>
                <input id="firstName" />
            </FormField>
        );

        expect(screen.getByLabelText("Nome*(obbligatorio)")).toBeInTheDocument();
    });

    it("senza errore non mostra alcun messaggio", () => {
        render(
            <FormField id="city" label="Città">
                <input {...fieldProps("city")} />
            </FormField>
        );

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Città")).toBeValid();
    });
});

describe("SearchInput", () => {
    const ControlledSearch = ({ onValueChange }: { onValueChange?: (value: string) => void }) => {
        const [value, setValue] = useState("");
        return (
            <SearchInput
                value={value}
                label="Cerca clienti"
                onValueChange={(next) => {
                    setValue(next);
                    onValueChange?.(next);
                }}
            />
        );
    };

    it("riporta il testo digitato", async () => {
        const onValueChange = vi.fn();
        render(<ControlledSearch onValueChange={onValueChange} />);

        await userEvent.type(screen.getByRole("searchbox", { name: "Cerca clienti" }), "ros");

        expect(onValueChange).toHaveBeenLastCalledWith("ros");
    });

    it("mostra la X solo quando c'è qualcosa da cancellare, e rimette il focus nel campo", async () => {
        render(<ControlledSearch />);
        const input = screen.getByRole("searchbox");

        expect(screen.queryByRole("button", { name: "Cancella ricerca" })).not.toBeInTheDocument();

        await userEvent.type(input, "rossi");
        await userEvent.click(screen.getByRole("button", { name: "Cancella ricerca" }));

        expect(input).toHaveValue("");
        expect(input).toHaveFocus();
        expect(screen.queryByRole("button", { name: "Cancella ricerca" })).not.toBeInTheDocument();
    });

    /** Esc deve svuotare il campo senza chiudere il dialogo che lo contiene. */
    it("svuota il campo con Esc senza far risalire il tasto", async () => {
        const onParentKeyDown = vi.fn();
        render(
            <div onKeyDown={onParentKeyDown}>
                <ControlledSearch />
            </div>
        );
        const input = screen.getByRole("searchbox");

        await userEvent.type(input, "rossi");
        onParentKeyDown.mockClear();
        await userEvent.keyboard("{Escape}");

        expect(input).toHaveValue("");
        expect(onParentKeyDown).not.toHaveBeenCalled();

        // A campo vuoto Esc torna a fare il suo mestiere.
        await userEvent.keyboard("{Escape}");
        expect(onParentKeyDown).toHaveBeenCalled();
    });

    it("usa il segnaposto come nome accessibile se manca l'etichetta", () => {
        render(<SearchInput value="" onValueChange={() => {}} placeholder="Cerca report..." />);

        expect(screen.getByRole("searchbox", { name: "Cerca report..." })).toBeInTheDocument();
    });
});

describe("PaymentMethodSelector", () => {
    it("è un gruppo di radio con la voce corrente selezionata", () => {
        render(<PaymentMethodSelector value="cash" onValueChange={() => {}} />);

        expect(screen.getByRole("radiogroup", { name: "Metodo di pagamento" })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Contanti" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Carta" })).not.toBeChecked();
        expect(screen.getByRole("radio", { name: "Non pagato" })).not.toBeChecked();
    });

    it("riporta la voce scelta", async () => {
        const onValueChange = vi.fn<(value: PaymentMethod) => void>();
        render(<PaymentMethodSelector value="non_paid" onValueChange={onValueChange} />);

        await userEvent.click(screen.getByRole("radio", { name: "Carta" }));

        expect(onValueChange).toHaveBeenCalledWith("card");
    });
});
