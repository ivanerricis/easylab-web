import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    listUsers: vi.fn(),
    regeneratePassword: vi.fn(),
    disableUser: vi.fn(),
    enableUser: vi.fn(),
    deleteUser: vi.fn(),
    disableUserTwoFactor: vi.fn(),
    getTwoFactorStatus: vi.fn(),
    disableTwoFactor: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
    getEmailSettings: vi.fn(),
    updateEmailSettings: vi.fn(),
    testEmailConnection: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forwarded = Object.fromEntries(
        Object.keys(api).map((name) => [
            name,
            (...args: unknown[]) => (api[name as keyof typeof api] as (...a: unknown[]) => unknown)(...args),
        ])
    );
    return { ...errors, ...forwarded, createUser: vi.fn(), startTwoFactorSetup: vi.fn(), enableTwoFactor: vi.fn() };
});

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { AuthProviderContext, initialAuthProviderState } from "@/components/auth-provider-context";
import EmailSettingsPanel from "./emailSettingsPanel";
import SecuritySettingsSection from "./securitySettingsSection";
import UsersSettingsSection from "./usersSettingsSection";
import type { UserDto } from "@/lib/api";
import { renderWithProviders } from "@/test/render";

const admin: UserDto = {
    id: 1,
    username: "admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: true,
    twoFactorEnabled: true,
};

const luigi: UserDto = { ...admin, id: 2, username: "luigi", isAdmin: false, twoFactorEnabled: false };

const refresh = vi.fn();

const renderWithUser = (ui: React.ReactElement, user: UserDto = admin) =>
    renderWithProviders(
        <AuthProviderContext.Provider value={{ ...initialAuthProviderState, isLoading: false, user, refresh }}>
            {ui}
        </AuthProviderContext.Provider>
    );

beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockResolvedValue(undefined);
});

describe("UsersSettingsSection", () => {
    const rowOf = (username: string) => {
        const cell = within(screen.getByRole("table")).getByText(username);
        return cell.closest("tr") as HTMLElement;
    };

    beforeEach(() => {
        api.listUsers.mockResolvedValue([admin, luigi]);
    });

    /**
     * Sul proprio account niente rigenera, disabilita o elimina: il backend rifiuterebbe, e un
     * amministratore che si chiude fuori da solo non avrebbe più modo di rientrare.
     */
    it("sul proprio account offre solo lo sblocco della 2FA", async () => {
        renderWithUser(<UsersSettingsSection />);
        await within(await screen.findByRole("table")).findByText("luigi");

        const own = within(rowOf("admin"));
        expect(own.getByText("(tu)")).toBeInTheDocument();
        expect(own.getByRole("button", { name: "Disattiva 2FA" })).toBeInTheDocument();
        expect(own.queryByRole("button", { name: "Rigenera password" })).not.toBeInTheDocument();
        expect(own.queryByRole("button", { name: "Disabilita" })).not.toBeInTheDocument();
        expect(own.queryByRole("button", { name: "Elimina" })).not.toBeInTheDocument();

        const other = within(rowOf("luigi"));
        expect(other.getByRole("button", { name: "Rigenera password" })).toBeInTheDocument();
        expect(other.getByRole("button", { name: "Disabilita" })).toBeInTheDocument();
        expect(other.queryByRole("button", { name: "Disattiva 2FA" })).not.toBeInTheDocument();
    });

    it("togliere la propria 2FA richiede la password, quella di un altro no", async () => {
        api.disableUserTwoFactor.mockResolvedValue({ ...admin, twoFactorEnabled: false });
        renderWithUser(<UsersSettingsSection />);
        await within(await screen.findByRole("table")).findByText("luigi");

        await userEvent.click(within(rowOf("admin")).getByRole("button", { name: "Disattiva 2FA" }));
        const dialog = screen.getByRole("dialog", { name: "Disattiva la verifica in due passaggi" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));
        expect(toast.error).toHaveBeenCalledWith("Inserisci la tua password");
        expect(api.disableUserTwoFactor).not.toHaveBeenCalled();

        await userEvent.type(within(dialog).getByLabelText("Password"), "segreta1!");
        await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));

        await waitFor(() => {
            expect(api.disableUserTwoFactor).toHaveBeenCalledWith(1, "segreta1!");
        });
    });

    it("rigenera la password di un altro e la mostra una volta", async () => {
        api.regeneratePassword.mockResolvedValue({ user: luigi, generatedPassword: "Nuova!Pass1" });
        renderWithUser(<UsersSettingsSection />);
        await within(await screen.findByRole("table")).findByText("luigi");

        await userEvent.click(within(rowOf("luigi")).getByRole("button", { name: "Rigenera password" }));
        await userEvent.click(
            within(screen.getByRole("dialog", { name: "Rigenera password" })).getByRole("button", { name: "Rigenera" })
        );

        expect(await screen.findByRole("dialog", { name: "Password generata" })).toBeInTheDocument();
        expect(screen.getByLabelText("Password")).toHaveValue("Nuova!Pass1");
        expect(api.regeneratePassword).toHaveBeenCalledWith(2);
    });

    it("disabilita e riabilita un account", async () => {
        api.disableUser.mockResolvedValue({ ...luigi, active: false });
        api.enableUser.mockResolvedValue({ ...luigi, active: true });
        renderWithUser(<UsersSettingsSection />);
        await within(await screen.findByRole("table")).findByText("luigi");

        await userEvent.click(within(rowOf("luigi")).getByRole("button", { name: "Disabilita" }));
        await userEvent.click(
            within(screen.getByRole("dialog", { name: "Disabilita account" })).getByRole("button", {
                name: "Disabilita",
            })
        );

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Account "luigi" disabilitato');
        });
        await userEvent.click(within(rowOf("luigi")).getByRole("button", { name: "Riabilita" }));

        await waitFor(() => {
            expect(api.enableUser).toHaveBeenCalledWith(2);
        });
        expect(within(rowOf("luigi")).getByRole("button", { name: "Disabilita" })).toBeInTheDocument();
    });

    it("elimina un utente dall'elenco dopo la conferma", async () => {
        api.deleteUser.mockResolvedValue(undefined);
        renderWithUser(<UsersSettingsSection />);
        await within(await screen.findByRole("table")).findByText("luigi");

        await userEvent.click(within(rowOf("luigi")).getByRole("button", { name: "Elimina" }));
        const dialog = screen.getByRole("dialog", { name: "Elimina utente" });
        await userEvent.type(within(dialog).getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(within(screen.getByRole("table")).queryByText("luigi")).not.toBeInTheDocument();
        });
        expect(api.deleteUser).toHaveBeenCalledWith(2);
    });
});

describe("SecuritySettingsSection", () => {
    it("propone di attivare la 2FA quando è spenta", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: false, remainingRecoveryCodes: 0 });
        renderWithUser(<SecuritySettingsSection />, luigi);

        expect(await screen.findByText("Non attiva")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Attiva" })).toBeInTheDocument();
    });

    /** Senza codici di recupero, perdere il telefono vuol dire restare fuori: va detto chiaro. */
    it("avverte quando non restano codici di recupero", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 0 });
        renderWithUser(<SecuritySettingsSection />);

        expect(await screen.findByText(/Non ti resta nessun codice di recupero/)).toBeInTheDocument();
    });

    it("conta i codici di recupero rimasti", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 5 });
        renderWithUser(<SecuritySettingsSection />);

        expect(await screen.findByText("Codici di recupero ancora utilizzabili: 5 su 8.")).toBeInTheDocument();
    });

    it("disattiva la 2FA e aggiorna anche l'utente in sessione", async () => {
        api.getTwoFactorStatus
            .mockResolvedValueOnce({ enabled: true, remainingRecoveryCodes: 5 })
            .mockResolvedValue({ enabled: false, remainingRecoveryCodes: 0 });
        api.disableTwoFactor.mockResolvedValue(undefined);
        renderWithUser(<SecuritySettingsSection />);

        await userEvent.click(await screen.findByRole("button", { name: "Disattiva" }));
        const dialog = screen.getByRole("dialog", { name: "Disattiva la verifica in due passaggi" });
        await userEvent.type(within(dialog).getByLabelText("Password"), "segreta1!");
        await userEvent.type(within(dialog).getByLabelText("Codice di verifica o di recupero"), "123456");
        await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));

        expect(await screen.findByText("Non attiva")).toBeInTheDocument();
        expect(api.disableTwoFactor).toHaveBeenCalledWith({ password: "segreta1!", code: "123456" });
        expect(refresh).toHaveBeenCalled();
    });

    it("con un codice sbagliato mostra l'errore una volta sola e lascia riprovare", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 5 });
        api.disableTwoFactor.mockRejectedValue(new Error("Codice non valido"));
        renderWithUser(<SecuritySettingsSection />);

        await userEvent.click(await screen.findByRole("button", { name: "Disattiva" }));
        const dialog = screen.getByRole("dialog", { name: "Disattiva la verifica in due passaggi" });
        await userEvent.type(within(dialog).getByLabelText("Password"), "segreta1!");
        await userEvent.type(within(dialog).getByLabelText("Codice di verifica o di recupero"), "000000");
        await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Codice non valido");
        });
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: "Disattiva la verifica in due passaggi" })).toBeInTheDocument();
    });
});

describe("EmailSettingsPanel", () => {
    const saved = {
        enabled: true,
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: "lab",
        fromName: "EasyLab",
        fromEmail: "info@example.com",
        passwordSet: true,
    };

    const saveButton = () => screen.getByRole("button", { name: "Salva impostazioni" });

    beforeEach(() => {
        api.getEmailSettings.mockResolvedValue(saved);
        api.updateEmailSettings.mockImplementation(async (payload: Record<string, unknown>) => {
            // Come il server: la password non torna mai indietro.
            const response: Record<string, unknown> = { ...payload, passwordSet: true };
            delete response.password;
            return response;
        });
    });

    it("attiva Salva solo quando qualcosa è cambiato", async () => {
        renderWithUser(<EmailSettingsPanel />);
        await waitFor(() => {
            expect(screen.getByLabelText("Host SMTP")).toHaveValue("smtp.example.com");
        });

        expect(saveButton()).toBeDisabled();

        await userEvent.type(screen.getByLabelText("Password"), "nuova");

        expect(saveButton()).toBeEnabled();
    });

    it("rifiuta un mittente non valido", async () => {
        renderWithUser(<EmailSettingsPanel />);
        const fromEmail = await screen.findByLabelText("Email mittente");
        await waitFor(() => {
            expect(fromEmail).toHaveValue("info@example.com");
        });

        await userEvent.clear(fromEmail);
        await userEvent.type(fromEmail, "info@");
        await userEvent.click(saveButton());

        expect(toast.error).toHaveBeenCalledWith("L'email mittente non è valida");
        expect(api.updateEmailSettings).not.toHaveBeenCalled();
    });

    /** Salvato con degli spazi, il form deve tornare pulito: prima Salva restava attivo. */
    it("dopo il salvataggio mostra i valori salvati e torna pulito", async () => {
        renderWithUser(<EmailSettingsPanel />);
        const host = await screen.findByLabelText("Host SMTP");
        await waitFor(() => {
            expect(host).toHaveValue("smtp.example.com");
        });

        await userEvent.clear(host);
        await userEvent.type(host, "  smtp.nuovo.it  ");
        await userEvent.click(saveButton());

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith("Impostazioni email salvate");
        });
        expect(api.updateEmailSettings).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.nuovo.it" }));
        expect(host).toHaveValue("smtp.nuovo.it");
        expect(saveButton()).toBeDisabled();
    });
});
