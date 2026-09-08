import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RefreshButton from "./refresh-button";
import { TooltipProvider } from "./ui/tooltip";

const renderButton = (props: Partial<React.ComponentProps<typeof RefreshButton>> = {}) => {
    const onRefresh = props.onRefresh ?? vi.fn();

    render(
        <TooltipProvider>
            <RefreshButton {...props} onRefresh={onRefresh} />
        </TooltipProvider>
    );

    return onRefresh;
};

describe("RefreshButton", () => {
    it("richiama onRefresh al click", async () => {
        const user = userEvent.setup();
        const onRefresh = vi.fn();
        renderButton({ onRefresh });

        await user.click(screen.getByRole("button", { name: "Aggiorna dati" }));

        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("resta disabilitato finché il caricamento non si conclude, così un doppio click non parte due volte", async () => {
        const user = userEvent.setup();
        let resolveRefresh = () => {};
        const onRefresh = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveRefresh = resolve;
                })
        );
        renderButton({ onRefresh, label: "Aggiorna elenco" });

        const button = screen.getByRole("button", { name: "Aggiorna elenco" });
        await user.click(button);

        expect(button).toBeDisabled();
        await user.click(button);
        expect(onRefresh).toHaveBeenCalledTimes(1);

        resolveRefresh();
        await waitFor(() => expect(button).toBeEnabled());
    });

    it("mostra il caricamento avviato dalla pagina anche se non arriva dal pulsante", () => {
        renderButton({ isRefreshing: true });

        const button = screen.getByRole("button", { name: "Aggiorna dati" });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
    });
});
