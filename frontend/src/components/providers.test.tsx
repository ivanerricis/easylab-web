import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { BusyGuardProvider } from "./busy-guard-provider";
import { ThemeProvider } from "./theme-provider";
import { useBusyGuard } from "./use-busy-guard";
import { useTheme } from "./use-theme";

describe("BusyGuardProvider", () => {
    const BusyButton = () => {
        const { setBusy } = useBusyGuard();
        return (
            <>
                <button onClick={() => setBusy({ title: "Ripristino in corso", description: "Attendere" })}>
                    Blocca
                </button>
                <button onClick={() => setBusy(null)}>Sblocca</button>
            </>
        );
    };

    const dispatchBeforeUnload = () => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event;
    };

    it("copre la pagina con il messaggio finché l'operazione è in corso", async () => {
        render(
            <BusyGuardProvider>
                <BusyButton />
            </BusyGuardProvider>
        );

        await userEvent.click(screen.getByRole("button", { name: "Blocca" }));

        expect(screen.getByRole("alert")).toHaveTextContent("Ripristino in corso");
        expect(screen.getByRole("alert")).toHaveTextContent("Attendere");
    });

    /**
     * Chiudere la scheda a metà di un ripristino lascia il database in uno stato
     * inconsistente: il browser deve chiedere conferma, e solo in quel momento.
     */
    it("chiede conferma prima di chiudere la scheda solo mentre è bloccata", () => {
        let setBusy: ReturnType<typeof useBusyGuard>["setBusy"] = () => {};
        const Capture = () => {
            setBusy = useBusyGuard().setBusy;
            return null;
        };
        render(
            <BusyGuardProvider>
                <Capture />
            </BusyGuardProvider>
        );

        expect(dispatchBeforeUnload().defaultPrevented).toBe(false);

        act(() => setBusy({ title: "Aggiornamento", description: "" }));
        expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

        act(() => setBusy(null));
        expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("fuori dal provider l'hook fallisce con un messaggio chiaro", () => {
        expect(() => renderHook(() => useBusyGuard())).toThrow(
            "useBusyGuard deve essere usato dentro BusyGuardProvider"
        );
    });
});

describe("ThemeProvider", () => {
    const ThemeSwitch = () => {
        const { theme, setTheme } = useTheme();
        return <button onClick={() => setTheme("dark")}>Tema: {theme}</button>;
    };

    beforeEach(() => {
        localStorage.clear();
        document.documentElement.className = "";
    });

    it("con il tema di sistema segue la preferenza del sistema operativo", () => {
        // Lo stub di matchMedia in setup.ts risponde sempre `matches: false`, cioè tema chiaro.
        render(
            <ThemeProvider>
                <ThemeSwitch />
            </ThemeProvider>
        );

        expect(screen.getByRole("button")).toHaveTextContent("Tema: system");
        expect(document.documentElement).toHaveClass("light");
    });

    it("applica il tema scelto e lo ricorda", async () => {
        render(
            <ThemeProvider storageKey="tema-test">
                <ThemeSwitch />
            </ThemeProvider>
        );

        await userEvent.click(screen.getByRole("button"));

        expect(document.documentElement).toHaveClass("dark");
        expect(document.documentElement).not.toHaveClass("light");
        expect(localStorage.getItem("tema-test")).toBe("dark");
    });

    it("riparte dal tema salvato", () => {
        localStorage.setItem("vite-ui-theme", "dark");

        render(
            <ThemeProvider>
                <ThemeSwitch />
            </ThemeProvider>
        );

        expect(screen.getByRole("button")).toHaveTextContent("Tema: dark");
        expect(document.documentElement).toHaveClass("dark");
    });
});
