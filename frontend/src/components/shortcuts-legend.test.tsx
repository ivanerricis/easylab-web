import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ShortcutsLegend from "./shortcuts-legend";
import { renderWithProviders } from "@/test/render";

describe("ShortcutsLegend", () => {
    it('resta nascosta finché non si preme "?"', async () => {
        renderWithProviders(<ShortcutsLegend />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await userEvent.keyboard("?");

        expect(await screen.findByRole("dialog", { name: "Scorciatoie da tastiera" })).toBeInTheDocument();
        expect(screen.getByText("Vai alla ricerca della pagina")).toBeInTheDocument();
    });

    /** La stessa protezione delle altre scorciatoie: "?" si deve poter scrivere. */
    it('non si apre mentre si scrive "?" in un campo', async () => {
        renderWithProviders(
            <>
                <input aria-label="Note" />
                <ShortcutsLegend />
            </>
        );

        await userEvent.click(screen.getByLabelText("Note"));
        await userEvent.keyboard("?");

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Note")).toHaveValue("?");
    });
});
