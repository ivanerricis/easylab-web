import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import CustomDialog from "./customDialog";
import { renderWithProviders } from "@/test/render";

const renderDialog = (props: Partial<React.ComponentProps<typeof CustomDialog>> = {}) => {
    const onConfirm = vi.fn();
    renderWithProviders(
        <CustomDialog
            open
            title="Nuovo report"
            onConfirm={onConfirm}
            content={<textarea aria-label="Note" />}
            {...props}
        />
    );
    return onConfirm;
};

describe("CustomDialog: Ctrl+Invio", () => {
    /** L'Invio da solo invia già il modulo, ma non da un'area di testo: lì va a capo. */
    it("conferma da un'area di testo, dove l'Invio va a capo", async () => {
        const onConfirm = renderDialog();

        await userEvent.click(screen.getByLabelText("Note"));
        await userEvent.keyboard("{Enter}");
        expect(onConfirm).not.toHaveBeenCalled();

        await userEvent.keyboard("{Control>}{Enter}{/Control}");
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("non conferma se il pulsante è disabilitato", async () => {
        const onConfirm = renderDialog({ confirmDisabled: true });

        await userEvent.click(screen.getByLabelText("Note"));
        await userEvent.keyboard("{Control>}{Enter}{/Control}");

        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("non conferma quando il dialogo non ha un pulsante di conferma", async () => {
        const onConfirm = renderDialog({ showConfirmButton: false });

        await userEvent.click(screen.getByLabelText("Note"));
        await userEvent.keyboard("{Control>}{Enter}{/Control}");

        expect(onConfirm).not.toHaveBeenCalled();
    });
});

/**
 * Il clic fuori non ha un test qui: né su `CustomDialog` né su un `<Dialog.Root>` Radix nudo
 * (provato a parte) jsdom smette il dialogo con un `pointerdown` simulato, quindi non c'è un
 * modo affidabile di automatizzarlo in questa suite. Il codice tolto (`onPointerDownOutside`)
 * era ridondante con `onInteractOutside`, che Radix chiama comunque anche per il clic fuori —
 * verificato leggendo il sorgente di `@radix-ui/react-dismissable-layer` (vedi il commento in
 * `customDialog.tsx`), non con un test automatico. Il resto del flusso "Modifiche non salvate"
 * (Esc, la X, Annulla) è comunque coperto in `entityDialogs.test.tsx`, e passa dallo stesso
 * `handleOpenChange` che gestirebbe anche il clic fuori.
 */

/**
 * I dialoghi dell'app sono controllati e si aprono da un pulsante qualunque, non da un
 * `DialogTrigger`: Radix alla chiusura non sapeva dove riportare il focus e lo lasciava sul
 * `body`, e chi usa la tastiera ripartiva dall'inizio della pagina.
 */
describe("CustomDialog: focus alla chiusura", () => {
    const Opener = () => {
        const [open, setOpen] = useState(false);

        return (
            <>
                <button type="button" onClick={() => setOpen(true)}>
                    Apri
                </button>
                <CustomDialog
                    open={open}
                    onOpenChange={setOpen}
                    title="Nuovo report"
                    content={<input aria-label="Nome" />}
                />
            </>
        );
    };

    it("torna sul pulsante che ha aperto il dialogo", async () => {
        renderWithProviders(<Opener />);

        await userEvent.click(screen.getByRole("button", { name: "Apri" }));
        expect(await screen.findByRole("dialog")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        await vi.waitFor(() => expect(screen.getByRole("button", { name: "Apri" })).toHaveFocus());
    });
});
