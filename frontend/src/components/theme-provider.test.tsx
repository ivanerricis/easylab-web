import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
