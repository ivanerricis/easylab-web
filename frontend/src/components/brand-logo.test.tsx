import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BrandLogo from "./brand-logo";

describe("BrandLogo", () => {
    it("mostra il segnaposto al posto dell'immagine rotta", () => {
        render(<BrandLogo src="/logo.jpg" alt="Logo laboratorio" />);

        fireEvent.error(screen.getByRole("img", { name: "Logo laboratorio" }));

        const placeholder = screen.getByRole("img", { name: "Logo laboratorio" });
        expect(placeholder.tagName).toBe("DIV");
    });

    /** Un logo appena caricato dalle impostazioni cambia indirizzo: va riprovato. */
    it("riprova quando cambia l'indirizzo", () => {
        const { rerender } = render(<BrandLogo src="/logo.jpg?v=1" alt="Logo attuale" />);
        fireEvent.error(screen.getByRole("img", { name: "Logo attuale" }));

        rerender(<BrandLogo src="/logo.jpg?v=2" alt="Logo attuale" />);

        expect(screen.getByRole("img", { name: "Logo attuale" })).toHaveAttribute("src", "/logo.jpg?v=2");
    });
});
