import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
