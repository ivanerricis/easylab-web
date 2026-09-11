import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DatePickerField from "@/components/date-picker-field";
import PrintRangeDialog from "./printRangeDialog";
import { renderWithProviders } from "@/test/render";

describe("PrintRangeDialog", () => {
    it("stampa l'intervallo indicato e chiude", async () => {
        const onConfirm = vi.fn();
        const onOpenChange = vi.fn();
        renderWithProviders(
            <PrintRangeDialog open onOpenChange={onOpenChange} title="Stampa report" onConfirm={onConfirm} />
        );

        fireEvent.change(screen.getByLabelText("Da"), { target: { value: "2026-01-01" } });
        fireEvent.change(screen.getByLabelText("A"), { target: { value: "2026-03-31" } });
        await userEvent.click(screen.getByRole("button", { name: "Stampa" }));

        expect(onConfirm).toHaveBeenCalledWith({ dateFrom: "2026-01-01", dateTo: "2026-03-31" });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("impedisce nel selettore una fine precedente all'inizio", () => {
        renderWithProviders(<PrintRangeDialog open onOpenChange={() => {}} title="Stampa" onConfirm={() => {}} />);

        fireEvent.change(screen.getByLabelText("Da"), { target: { value: "2026-02-01" } });

        expect(screen.getByLabelText("A")).toHaveAttribute("min", "2026-02-01");
    });

    /** Senza date si stampa tutto lo storico: può essere lungo, quindi lo si chiede prima. */
    it("senza date chiede conferma prima di stampare tutto", async () => {
        const onConfirm = vi.fn();
        renderWithProviders(<PrintRangeDialog open onOpenChange={() => {}} title="Stampa" onConfirm={onConfirm} />);

        await userEvent.click(screen.getByRole("button", { name: "Stampa" }));

        expect(onConfirm).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog", { name: "Stampare tutto lo storico?" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Stampa tutto" }));

        expect(onConfirm).toHaveBeenCalledWith({ dateFrom: undefined, dateTo: undefined });
    });

    it("annullando la conferma torna all'intervallo", async () => {
        const onConfirm = vi.fn();
        renderWithProviders(<PrintRangeDialog open onOpenChange={() => {}} title="Stampa" onConfirm={onConfirm} />);

        await userEvent.click(screen.getByRole("button", { name: "Stampa" }));
        await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

        expect(screen.getByRole("dialog", { name: "Stampa" })).toBeInTheDocument();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("riaprendo il dialogo le date ripartono vuote", () => {
        const props = { onOpenChange: () => {}, title: "Stampa", onConfirm: () => {} };
        const { rerender } = renderWithProviders(<PrintRangeDialog open {...props} />);
        fireEvent.change(screen.getByLabelText("Da"), { target: { value: "2026-02-01" } });

        rerender(<PrintRangeDialog open={false} {...props} />);
        rerender(<PrintRangeDialog open {...props} />);

        expect(screen.getByLabelText("Da")).toHaveValue("");
    });
});

describe("DatePickerField", () => {
    it("mostra la data in italiano, o il segnaposto", () => {
        const { rerender } = renderWithProviders(<DatePickerField value="" onValueChange={() => {}} />);
        expect(screen.getByRole("button")).toHaveTextContent("Seleziona data");

        rerender(<DatePickerField value="2026-09-11" onValueChange={() => {}} />);
        expect(screen.getByRole("button")).toHaveTextContent("11/09/2026");
    });

    it("riporta il giorno scelto nel formato AAAA-MM-GG, senza spostamenti di fuso", async () => {
        const onValueChange = vi.fn();
        renderWithProviders(<DatePickerField value="2026-09-11" onValueChange={onValueChange} />);

        await userEvent.click(screen.getByRole("button", { name: /11\/09\/2026/ }));
        await userEvent.click(screen.getByRole("button", { name: /1 settembre 2026|September 1st, 2026/ }));

        expect(onValueChange).toHaveBeenCalledWith("2026-09-01");
    });
});
