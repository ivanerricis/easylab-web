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

    /** Senza `steps` il comportamento resta quello di sempre: nessun elenco, solo spinner. */
    it("senza passi mostra solo il messaggio, come prima", async () => {
        render(
            <BusyGuardProvider>
                <BusyButton />
            </BusyGuardProvider>
        );

        await userEvent.click(screen.getByRole("button", { name: "Blocca" }));

        expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("con i passi evidenzia quello attivo e spunta quelli già fatti", () => {
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

        act(() =>
            setBusy({
                title: "Aggiornamento",
                description: "",
                steps: [
                    { key: "a", label: "Passo A" },
                    { key: "b", label: "Passo B" },
                    { key: "c", label: "Passo C" },
                ],
                activeStepKey: "b",
            })
        );

        expect(screen.getByText("Passo B").closest("li")).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Passo A").closest("li")).not.toHaveAttribute("aria-current");
        expect(screen.getByText("Passo C").closest("li")).not.toHaveAttribute("aria-current");
    });

    /**
     * `activeStepKey: null` è "oltre l'ultimo passo": serve a spuntare anche l'ultimo quando
     * l'operazione è riuscita, invece di lasciarlo segnato come ancora in corso finché
     * l'overlay non sparisce (bug osservato sull'ultima fase dell'aggiornamento).
     */
    it("con activeStepKey a null spunta anche l'ultimo passo", () => {
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

        act(() =>
            setBusy({
                title: "Aggiornamento",
                description: "",
                steps: [
                    { key: "a", label: "Passo A" },
                    { key: "b", label: "Passo B" },
                ],
                activeStepKey: null,
            })
        );

        expect(screen.getByText("Passo A").closest("li")).toHaveAttribute("data-status", "done");
        expect(screen.getByText("Passo B").closest("li")).toHaveAttribute("data-status", "done");
        expect(screen.queryByText("Passo A")?.closest("li")).not.toHaveAttribute("aria-current");
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
