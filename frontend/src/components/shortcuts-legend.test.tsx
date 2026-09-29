import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import ShortcutsLegend from "./shortcuts-legend";
import { renderWithProviders } from "@/test/render";
import { setStoredKeyboardShortcutsEnabled } from "@/lib/theme";

beforeEach(() => {
    localStorage.clear();
});

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

    /**
     * Con le scorciatoie a un tasto spente "?" resta attivo, e l'elenco dice dove riaccenderle:
     * altrimenti chi le ha spente non avrebbe più modo di scoprirlo dalla tastiera.
     */
    it("si apre anche a scorciatoie spente e dice dove riattivarle", async () => {
        setStoredKeyboardShortcutsEnabled(false);
        renderWithProviders(<ShortcutsLegend />);

        await userEvent.keyboard("?");

        const dialog = await screen.findByRole("dialog", { name: "Scorciatoie da tastiera" });
        expect(dialog).toHaveTextContent("Le scorciatoie a un tasto sono disattivate");
        expect(screen.getByRole("link", { name: "Impostazioni › Tema" })).toHaveAttribute(
            "href",
            "/settings?section=theme"
        );
    });

    it("a scorciatoie attive dice dove spegnerle", async () => {
        renderWithProviders(<ShortcutsLegend />);

        await userEvent.keyboard("?");

        expect(await screen.findByRole("dialog")).toHaveTextContent("si possono disattivare in");
    });
});
