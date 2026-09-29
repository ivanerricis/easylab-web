import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDeleteDialog from "./confirmDeleteDialog";
import { renderWithProviders } from "@/test/render";

const renderDialog = (props: Partial<Parameters<typeof ConfirmDeleteDialog>[0]> = {}) =>
    renderWithProviders(
        <ConfirmDeleteDialog
            open
            onOpenChange={() => {}}
            title="Elimina cliente"
            description="Sei sicuro di voler eliminare Mario Rossi?"
            onConfirm={() => {}}
            {...props}
        />
    );

describe("ConfirmDeleteDialog", () => {
    it("sblocca l'eliminazione solo con la parola di conferma", async () => {
        const onConfirm = vi.fn();
        renderDialog({ onConfirm });
        const confirm = screen.getByRole("button", { name: "Elimina" });
        const input = screen.getByLabelText("Digita ELIMINA per confermare");

        expect(confirm).toBeDisabled();

        await userEvent.type(input, "ELIMIN");
        expect(confirm).toBeDisabled();

        await userEvent.clear(input);
        await userEvent.type(input, "ELIMINA");
        await userEvent.click(confirm);

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    /**
     * Sul telefono la tastiera mette la maiuscola solo alla prima lettera, e la tastiera
     * suggerita aggiunge uno spazio dopo la parola: "Elimina " è la parola giusta scritta come la
     * scrive un telefono, e prima lasciava il pulsante spento senza dire perché.
     */
    it("accetta la parola scritta come la scrive un telefono (maiuscole e spazi)", async () => {
        renderDialog();
        const input = screen.getByLabelText("Digita ELIMINA per confermare");

        await userEvent.type(input, "Elimina ");

        expect(screen.getByRole("button", { name: "Elimina" })).toBeEnabled();
    });

    it("chiede alla tastiera maiuscole e niente correzioni", () => {
        renderDialog();
        const input = screen.getByLabelText("Digita ELIMINA per confermare");

        expect(input).toHaveAttribute("autocapitalize", "characters");
        expect(input).toHaveAttribute("autocorrect", "off");
        expect(input).toHaveAttribute("spellcheck", "false");
    });

    /**
     * Il dialogo resta montato fra un'eliminazione e l'altra: se la parola restasse scritta,
     * la seconda eliminazione partirebbe con il pulsante già sbloccato.
     */
    it("dimentica la parola digitata quando viene riaperto", async () => {
        const props = {
            onOpenChange: () => {},
            title: "Elimina",
            description: "Sicuro?",
            onConfirm: () => {},
        };
        const { rerender } = renderWithProviders(<ConfirmDeleteDialog open {...props} />);
        await userEvent.type(screen.getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");

        rerender(<ConfirmDeleteDialog open={false} {...props} />);
        rerender(<ConfirmDeleteDialog open {...props} />);

        expect(screen.getByLabelText("Digita ELIMINA per confermare")).toHaveValue("");
        expect(screen.getByRole("button", { name: "Elimina" })).toBeDisabled();
    });

    it("durante l'eliminazione blocca campo e pulsanti", () => {
        renderDialog({ isDeleting: true });

        expect(screen.getByRole("button", { name: "Eliminazione..." })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled();
        expect(screen.getByLabelText("Digita ELIMINA per confermare")).toBeDisabled();
    });

    it("chiude con Annulla", async () => {
        const onOpenChange = vi.fn();
        renderDialog({ onOpenChange });

        await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("mostra titolo e descrizione", () => {
        renderDialog();

        expect(screen.getByRole("dialog", { name: "Elimina cliente" })).toHaveAccessibleDescription(
            "Sei sicuro di voler eliminare Mario Rossi?"
        );
    });
});
