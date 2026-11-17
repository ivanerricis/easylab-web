import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreateEntityButton from "@/components/create-entity-button";
import ShortcutKeys from "@/components/shortcut-keys";
import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(() => {
    localStorage.clear();
});

describe("ShortcutKeys", () => {
    it("mostra un tastino per ogni tasto della combinazione", () => {
        const { container } = render(<ShortcutKeys keys={["Ctrl", "B"]} />);

        expect([...container.querySelectorAll("kbd")].map((kbd) => kbd.textContent)).toEqual(["Ctrl", "B"]);
    });

    it("non suggerisce una scorciatoia a un tasto quando sono spente in Impostazioni", () => {
        localStorage.setItem("easylab-web-keyboard-shortcuts", "off");

        const { container } = render(<ShortcutKeys keys={["n"]} singleKey />);

        expect(container.querySelector("kbd")).toBeNull();
    });

    it("le combinazioni con Ctrl restano anche con le scorciatoie a un tasto spente", () => {
        localStorage.setItem("easylab-web-keyboard-shortcuts", "off");

        const { container } = render(<ShortcutKeys keys={["Ctrl", "K"]} />);

        expect(container.querySelectorAll("kbd")).toHaveLength(2);
    });
});

describe("CreateEntityButton", () => {
    it("mette la scorciatoia nel suggerimento, senza cambiare il nome del pulsante", async () => {
        render(
            <TooltipProvider delayDuration={0}>
                <CreateEntityButton label="Crea nuovo cliente" shortcut="n" onClick={vi.fn()} />
            </TooltipProvider>
        );
        const button = screen.getByRole("button", { name: "Crea nuovo cliente" });

        await userEvent.hover(button);

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Crea nuovo cliente");
        expect(
            tooltip.querySelector("kbd")?.textContent ??
                document.querySelector("[data-slot=tooltip-content] kbd")?.textContent
        ).toBe("n");
    });
});
