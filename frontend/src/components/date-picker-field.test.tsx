import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DatePickerField from "./date-picker-field";
import { renderWithProviders } from "@/test/render";

/**
 * Il calendario del selettore era in inglese ("September", "Su Mo Tu…", "Go to the Next
 * Month"), con la domenica in testa: stonava con il resto dell'app, e i lettori di schermo
 * leggevano le etichette in inglese.
 */
describe("DatePickerField: calendario in italiano", () => {
    const openCalendar = async (onValueChange = vi.fn()) => {
        renderWithProviders(<DatePickerField id="data" value="2026-09-10" onValueChange={onValueChange} />);
        await userEvent.click(screen.getByRole("button", { name: /10\/09\/2026/ }));
        return screen.getByRole("grid");
    };

    it("mostra mese e giorni in italiano, con la settimana che parte da lunedì", async () => {
        const grid = await openCalendar();

        expect(grid).toHaveAccessibleName(/settembre 2026/i);
        // Il 1° settembre 2026 è un martedì: con la settimana da lunedì la prima casella è
        // lunedì 31 agosto (da domenica sarebbe stata domenica 30).
        const firstDay = within(grid).getAllByRole("gridcell")[0];
        expect(within(firstDay).getByRole("button")).toHaveAccessibleName("lunedì 31 agosto 2026");
    });

    it("dà ai lettori di schermo etichette in italiano", async () => {
        await openCalendar();

        expect(screen.getByRole("button", { name: "Vai al mese successivo" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Vai al mese precedente" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^giovedì 10 settembre 2026, selezionato$/i })).toBeInTheDocument();
    });

    it("restituisce la data scelta come AAAA-MM-GG", async () => {
        const onValueChange = vi.fn();
        await openCalendar(onValueChange);

        await userEvent.click(screen.getByRole("button", { name: /^lunedì 14 settembre 2026$/i }));

        expect(onValueChange).toHaveBeenCalledWith("2026-09-14");
    });
});
