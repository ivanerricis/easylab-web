import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UnhandledErrorPage from "./UnhandledErrorPage";

describe("UnhandledErrorPage: struttura", () => {
    /** Da `div` il titolo non si trovava navigando per titoli, e senza un titolo non si capiva cosa fosse successo. */
    it("il titolo è l'h1 della pagina", () => {
        render(<UnhandledErrorPage title="Pagina rotta" />);

        expect(screen.getByRole("heading", { level: 1, name: "Pagina rotta" })).toBeInTheDocument();
    });

    /** Fuori dal layout (crash del layout stesso) la pagina è tutto quello che c'è. */
    it("da sola è il contenuto principale", () => {
        render(<UnhandledErrorPage />);

        expect(screen.getByRole("main")).toBeInTheDocument();
    });

    /** Dentro il layout il `<main>` c'è già: un secondo annidato verrebbe annunciato due volte. */
    it("dentro il <main> del layout non ne aggiunge un secondo", () => {
        render(
            <main>
                <UnhandledErrorPage />
            </main>
        );

        expect(screen.getAllByRole("main")).toHaveLength(1);
    });
});
