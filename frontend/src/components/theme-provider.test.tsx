import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";
import { useTheme } from "./use-theme";
import { blockLocalStorage } from "@/test/blockLocalStorage";

const ThemeProbe = () => {
    const { theme } = useTheme();
    return <p>Tema: {theme}</p>;
};

beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
});

describe("ThemeProvider", () => {
    it("parte dal tema salvato", () => {
        localStorage.setItem("vite-ui-theme", "dark");

        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>
        );

        expect(screen.getByText("Tema: dark")).toBeInTheDocument();
        expect(document.documentElement).toHaveClass("dark");
    });

    /**
     * Il provider sta sopra il limite d'errore dell'app: se la lettura del tema lanciasse,
     * resterebbe lo schermo bianco. Con i dati del sito bloccati si parte dal predefinito.
     */
    describe("con i dati del sito bloccati", () => {
        let restore: () => void;

        beforeEach(() => {
            restore = blockLocalStorage();
        });

        afterEach(() => {
            restore();
        });

        it("si monta con il tema predefinito invece di lanciare", () => {
            render(
                <ThemeProvider defaultTheme="light">
                    <ThemeProbe />
                </ThemeProvider>
            );

            expect(screen.getByText("Tema: light")).toBeInTheDocument();
            expect(document.documentElement).toHaveClass("light");
        });
    });
});

describe("ThemeProvider con tema di sistema", () => {
    const originalMatchMedia = window.matchMedia;
    let prefersDark: boolean;
    let listeners: Set<() => void>;
    const removeEventListener = vi.fn((_type: string, listener: () => void) => listeners.delete(listener));

    beforeEach(() => {
        prefersDark = false;
        listeners = new Set();
        removeEventListener.mockClear();
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            get matches() {
                return prefersDark;
            },
            media: query,
            addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
            removeEventListener,
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    it("segue il sistema operativo quando cambia a pagina aperta", () => {
        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>
        );
        expect(document.documentElement).toHaveClass("light");

        act(() => {
            prefersDark = true;
            listeners.forEach((listener) => listener());
        });

        expect(document.documentElement).toHaveClass("dark");
        expect(document.documentElement).not.toHaveClass("light");
    });

    it("smette di ascoltare il sistema allo smontaggio e con un tema scelto", () => {
        const { unmount } = render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>
        );
        expect(listeners.size).toBe(1);

        unmount();
        expect(listeners.size).toBe(0);

        localStorage.setItem("vite-ui-theme", "light");
        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>
        );
        expect(listeners.size).toBe(0);
    });

    it("si allinea alla scelta fatta in un'altra scheda", () => {
        render(
            <ThemeProvider>
                <ThemeProbe />
            </ThemeProvider>
        );

        act(() => {
            window.dispatchEvent(new StorageEvent("storage", { key: "vite-ui-theme", newValue: "dark" }));
        });
        expect(screen.getByText("Tema: dark")).toBeInTheDocument();
        expect(document.documentElement).toHaveClass("dark");

        act(() => {
            window.dispatchEvent(new StorageEvent("storage", { key: "altra-chiave", newValue: "light" }));
        });
        expect(screen.getByText("Tema: dark")).toBeInTheDocument();
    });
});
