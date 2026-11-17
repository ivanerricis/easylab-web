import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const changeOwnPassword = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return { ...errors, changeOwnPassword: (...args: unknown[]) => changeOwnPassword(...args) };
});

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import { AuthProviderContext, initialAuthProviderState } from "@/components/auth-provider-context";
import ForcePasswordChangePage from "./ForcePasswordChangePage";

const refresh = vi.fn();
const logout = vi.fn();

const renderPage = () =>
    render(
        <MemoryRouter>
            <AuthProviderContext.Provider
                value={{
                    ...initialAuthProviderState,
                    isLoading: false,
                    refresh,
                    logout,
                    user: {
                        id: 1,
                        username: "mario",
                        createdAt: "2026-01-01T00:00:00.000Z",
                        mustChangePassword: true,
                        active: true,
                        isAdmin: false,
                        twoFactorEnabled: false,
                        twoFactorSetupRequired: false,
                    },
                }}
            >
                <ForcePasswordChangePage />
            </AuthProviderContext.Provider>
        </MemoryRouter>
    );

const fill = async (current: string, next: string, confirm: string) => {
    const user = userEvent.setup();
    if (current) await user.type(screen.getByLabelText("Password attuale"), current);
    if (next) await user.type(screen.getByLabelText("Nuova password"), next);
    if (confirm) await user.type(screen.getByLabelText("Conferma nuova password"), confirm);
    await user.click(screen.getByRole("button", { name: "Imposta password e continua" }));
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("ForcePasswordChangePage", () => {
    /** Il titolo è l'h1 della pagina, dentro il punto di riferimento `main`. */
    it("ha un titolo di livello 1 dentro main", () => {
        renderPage();

        const heading = screen.getByRole("heading", { level: 1, name: "Imposta una nuova password" });
        expect(heading.closest("main")).not.toBeNull();
    });

    it("spiega a quale account si riferisce", () => {
        renderPage();

        expect(screen.getByText(/L'account "mario" usa ancora una password generata/)).toBeInTheDocument();
    });

    it("chiede la password attuale", async () => {
        renderPage();

        await fill("", "nuova-pass1!", "nuova-pass1!");

        const field = screen.getByLabelText("Password attuale");
        expect(screen.getByRole("alert")).toHaveTextContent("Inserisci la password attuale");
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(field).toHaveAccessibleDescription("Inserisci la password attuale");
        expect(field).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();
        expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("rifiuta una nuova password che non rispetta i requisiti", async () => {
        renderPage();

        await fill("vecchia", "corta", "corta");

        const field = screen.getByLabelText("Nuova password");
        expect(screen.getByRole("alert")).toHaveTextContent(/Almeno 8 caratteri/);
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(field).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();
        expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("rifiuta due password diverse", async () => {
        renderPage();

        await fill("vecchia", "nuova-pass1!", "nuova-pass2!");

        const field = screen.getByLabelText("Conferma nuova password");
        expect(screen.getByRole("alert")).toHaveTextContent("Le due password inserite non coincidono");
        expect(field).toHaveFocus();
        expect(toastError).not.toHaveBeenCalled();
        expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("porta il focus sul primo campo sbagliato e toglie l'errore appena si scrive", async () => {
        renderPage();

        await fill("", "corta", "");

        expect(screen.getAllByRole("alert")).toHaveLength(3);
        expect(screen.getByLabelText("Password attuale")).toHaveFocus();

        await userEvent.type(screen.getByLabelText("Password attuale"), "x");

        expect(screen.getByLabelText("Password attuale")).not.toHaveAttribute("aria-invalid");
        expect(screen.getAllByRole("alert")).toHaveLength(2);
    });

    it("ha un campo nome utente nascosto per il gestore di password", () => {
        const { container } = renderPage();

        const username = container.querySelector<HTMLInputElement>('input[autocomplete="username"]');
        expect(username).not.toBeNull();
        expect(username).toHaveValue("mario");
        expect(username).toHaveAttribute("readonly");
    });

    /** È `refresh` a far sparire questa pagina: rilegge l'utente, ora senza l'obbligo. */
    it("salva e ricarica l'utente per entrare nell'app", async () => {
        changeOwnPassword.mockResolvedValue(undefined);
        renderPage();

        await fill("vecchia", "nuova-pass1!", "nuova-pass1!");

        await waitFor(() => {
            expect(refresh).toHaveBeenCalled();
        });
        expect(changeOwnPassword).toHaveBeenCalledWith({ currentPassword: "vecchia", newPassword: "nuova-pass1!" });
        expect(toastSuccess).toHaveBeenCalled();
    });

    it("mostra l'errore del server e resta sulla pagina", async () => {
        changeOwnPassword.mockRejectedValue(new Error("Password attuale errata"));
        renderPage();

        await fill("sbagliata", "nuova-pass1!", "nuova-pass1!");

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Password attuale errata");
        });
        expect(refresh).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Imposta password e continua" })).toBeEnabled();
    });

    it("mostra entrambe le nuove password con un solo pulsante", async () => {
        renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Mostra password" }));

        expect(screen.getByLabelText("Nuova password")).toHaveAttribute("type", "text");
        expect(screen.getByLabelText("Conferma nuova password")).toHaveAttribute("type", "text");
        expect(screen.getByLabelText("Password attuale")).toHaveAttribute("type", "password");
    });

    it("permette di uscire", async () => {
        renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Esci" }));

        expect(logout).toHaveBeenCalled();
    });
});
