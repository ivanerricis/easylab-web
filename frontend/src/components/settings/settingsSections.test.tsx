import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    listUsers: vi.fn(),
    regeneratePassword: vi.fn(),
    disableUser: vi.fn(),
    enableUser: vi.fn(),
    deleteUser: vi.fn(),
    listUserSessions: vi.fn(),
    revokeUserSession: vi.fn(),
    listOwnSessions: vi.fn(),
    revokeOwnSession: vi.fn(),
    disableUserTwoFactor: vi.fn(),
    getTwoFactorStatus: vi.fn(),
    startTwoFactorSetup: vi.fn(),
    enableTwoFactor: vi.fn(),
    disableTwoFactor: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
    listRecentFailedLogins: vi.fn(),
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
    return { ...errors, ...forwarded, createUser: vi.fn() };
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
    twoFactorSetupRequired: false,
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
    api.listRecentFailedLogins.mockResolvedValue([]);
    api.listOwnSessions.mockResolvedValue([]);
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

        await userEvent.type(within(dialog).getByLabelText(/^Password/), "segreta1!");
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

    it("mostra le sessioni di un utente e ne permette la disconnessione", async () => {
        api.listUserSessions.mockResolvedValue([
            {
                id: "hash-corrente",
                createdAt: "2026-09-14T10:00:00.000Z",
                expiresAt: "2026-09-21T10:00:00.000Z",
                lastSeenAt: new Date().toISOString(),
                device: "Chrome su Windows",
                isCurrent: true,
            },
            {
                id: "hash-altro",
                createdAt: "2026-09-10T08:00:00.000Z",
                expiresAt: "2026-09-17T08:00:00.000Z",
                // Aperta giorni fa e mai più usata: è il caso che prima risultava attivo come
                // gli altri, e che ora il dialogo deve marcare come inattivo.
                lastSeenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                // Le sessioni aperte prima che l'header venisse salvato non hanno dispositivo.
                device: null,
                isCurrent: false,
            },
        ]);
        api.revokeUserSession.mockResolvedValue(undefined);
        renderWithUser(<UsersSettingsSection />);
        await within(await screen.findByRole("table")).findByText("luigi");

        await userEvent.click(within(rowOf("luigi")).getByRole("button", { name: "Sessioni" }));
        const dialog = screen.getByRole("dialog", { name: "Sessioni attive" });
        expect(api.listUserSessions).toHaveBeenCalledWith(2);

        await within(dialog).findByText("(questa sessione)");
        within(dialog).getByText("Chrome su Windows");
        within(dialog).getByText("Dispositivo sconosciuto");
        within(dialog).getByText("In uso adesso");
        within(dialog).getByText("Ultimo utilizzo 3 giorni fa (inattiva)");
        const disconnectButtons = within(dialog).getAllByRole("button", { name: "Disconnetti" });
        expect(disconnectButtons[0]).toBeDisabled();
        await userEvent.click(disconnectButtons[1]);

        const confirmDialog = await screen.findByRole("dialog", { name: "Disconnetti sessione" });
        await userEvent.click(within(confirmDialog).getByRole("button", { name: "Disconnetti" }));

        await waitFor(() => {
            expect(api.revokeUserSession).toHaveBeenCalledWith(2, "hash-altro");
        });
        expect(toast.success).toHaveBeenCalledWith("Sessione disconnessa");
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
        await userEvent.type(within(dialog).getByLabelText(/^Password/), "segreta1!");
        await userEvent.type(within(dialog).getByLabelText(/^Codice di verifica o di recupero/), "123456");
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
        await userEvent.type(within(dialog).getByLabelText(/^Password/), "segreta1!");
        await userEvent.type(within(dialog).getByLabelText(/^Codice di verifica o di recupero/), "000000");
        await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Codice non valido");
        });
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: "Disattiva la verifica in due passaggi" })).toBeInTheDocument();
    });

    it("se lo stato non si legge lo dice", async () => {
        api.getTwoFactorStatus.mockRejectedValue(new Error("Sessione scaduta"));
        renderWithUser(<SecuritySettingsSection />);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Sessione scaduta");
        });
    });

    /**
     * Il percorso intero dalla sezione: password, QR, codice, e alla fine gli otto codici di
     * recupero mostrati una volta sola. Dopo, stato e utente in sessione vanno riletti.
     */
    it("attiva la 2FA, mostra i codici di recupero e rilegge stato e utente", async () => {
        api.getTwoFactorStatus
            .mockResolvedValueOnce({ enabled: false, remainingRecoveryCodes: 0 })
            .mockResolvedValue({ enabled: true, remainingRecoveryCodes: 8 });
        api.startTwoFactorSetup.mockResolvedValue({
            secretBase32: "JBSWY3DPEHPK3PXP",
            otpauthUri: "otpauth://totp/EasyLab:luigi?secret=JBSWY3DPEHPK3PXP",
            qrDataUrl: "data:image/png;base64,AAAA",
        });
        api.enableTwoFactor.mockResolvedValue({ recoveryCodes: ["ABCD-2345", "EFGH-6789"] });
        renderWithUser(<SecuritySettingsSection />, luigi);

        await userEvent.click(await screen.findByRole("button", { name: "Attiva" }));
        const passwordStep = screen.getByRole("dialog", { name: "Attiva la verifica in due passaggi" });
        await userEvent.type(within(passwordStep).getByLabelText(/^Password/), "segreta1!");
        await userEvent.click(within(passwordStep).getByRole("button", { name: "Continua" }));

        const qrStep = await screen.findByRole("dialog", { name: "Inquadra il codice QR" });
        await userEvent.type(within(qrStep).getByLabelText(/^Codice di verifica/), "123456");
        await userEvent.click(within(qrStep).getByRole("button", { name: "Attiva" }));

        const codesDialog = await screen.findByRole("dialog", { name: "Codici di recupero" });
        expect(within(codesDialog).getByText("ABCD-2345")).toBeInTheDocument();
        expect(api.startTwoFactorSetup).toHaveBeenCalledWith("segreta1!");
        expect(api.enableTwoFactor).toHaveBeenCalledWith("123456");
        expect(await screen.findByText("Codici di recupero ancora utilizzabili: 8 su 8.")).toBeInTheDocument();
        expect(screen.queryByText("Non attiva")).not.toBeInTheDocument();
        expect(refresh).toHaveBeenCalled();
    });

    it("rigenera i codici di recupero con password e codice, e li mostra", async () => {
        api.getTwoFactorStatus
            .mockResolvedValueOnce({ enabled: true, remainingRecoveryCodes: 1 })
            .mockResolvedValue({ enabled: true, remainingRecoveryCodes: 8 });
        api.regenerateRecoveryCodes.mockResolvedValue({ recoveryCodes: ["WXYZ-2345"] });
        renderWithUser(<SecuritySettingsSection />);

        await userEvent.click(await screen.findByRole("button", { name: "Rigenera codici di recupero" }));
        const dialog = screen.getByRole("dialog", { name: "Rigenera i codici di recupero" });
        await userEvent.type(within(dialog).getByLabelText(/^Password/), "segreta1!");
        await userEvent.type(within(dialog).getByLabelText(/^Codice di verifica o di recupero/), " 123456 ");
        await userEvent.click(within(dialog).getByRole("button", { name: "Rigenera" }));

        expect(await screen.findByRole("dialog", { name: "Codici di recupero" })).toBeInTheDocument();
        expect(screen.getByText("WXYZ-2345")).toBeInTheDocument();
        expect(api.regenerateRecoveryCodes).toHaveBeenCalledWith({ password: "segreta1!", code: "123456" });
        expect(await screen.findByText("Codici di recupero ancora utilizzabili: 8 su 8.")).toBeInTheDocument();
    });

    it("se la rigenerazione fallisce lo dice una volta e lascia il dialogo aperto", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 3 });
        api.regenerateRecoveryCodes.mockRejectedValue(new Error("La password non è corretta"));
        renderWithUser(<SecuritySettingsSection />);

        await userEvent.click(await screen.findByRole("button", { name: "Rigenera codici di recupero" }));
        const dialog = screen.getByRole("dialog", { name: "Rigenera i codici di recupero" });
        await userEvent.type(within(dialog).getByLabelText(/^Password/), "sbagliata");
        await userEvent.type(within(dialog).getByLabelText(/^Codice di verifica o di recupero/), "123456");
        await userEvent.click(within(dialog).getByRole("button", { name: "Rigenera" }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("La password non è corretta");
        });
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: "Rigenera i codici di recupero" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Codici di recupero" })).not.toBeInTheDocument();
    });

    /** Per l'admin è obbligatoria: disattivarla vuol dire riconfigurarla subito dopo, e va detto prima. */
    it("all'amministratore che la disattiva avverte che dovrà configurarla di nuovo", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 5 });
        renderWithUser(<SecuritySettingsSection />, admin);

        await userEvent.click(await screen.findByRole("button", { name: "Disattiva" }));

        expect(
            within(screen.getByRole("dialog", { name: "Disattiva la verifica in due passaggi" })).getByText(
                /ti verrà chiesto di configurarla di nuovo/
            )
        ).toBeInTheDocument();
    });

    it("un amministratore vede gli ultimi accessi falliti", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: true, remainingRecoveryCodes: 5 });
        api.listRecentFailedLogins.mockResolvedValue([
            {
                timestamp: "2026-09-14T10:00:00.000Z",
                ip: "1.2.3.4",
                user: "-",
                action: "tentativo di accesso",
                status: 401,
                error: "Nome utente o password non validi",
            },
        ]);
        renderWithUser(<SecuritySettingsSection />, admin);

        expect(await screen.findByText("Nome utente o password non validi")).toBeInTheDocument();
        expect(api.listRecentFailedLogins).toHaveBeenCalled();
    });

    it("un utente non amministratore non vede la sezione né chiama l'API", async () => {
        api.getTwoFactorStatus.mockResolvedValue({ enabled: false, remainingRecoveryCodes: 0 });
        renderWithUser(<SecuritySettingsSection />, luigi);

        await screen.findByText("Non attiva");

        expect(screen.queryByText("Tentativi di accesso falliti")).not.toBeInTheDocument();
        expect(api.listRecentFailedLogins).not.toHaveBeenCalled();
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

    const renderLoaded = async (settings: typeof saved = saved) => {
        api.getEmailSettings.mockResolvedValue(settings);
        renderWithUser(<EmailSettingsPanel />);
        const host = await screen.findByLabelText("Host SMTP");
        await waitFor(() => {
            expect(host).toHaveValue(settings.host);
        });
        return host;
    };

    it("se il caricamento fallisce lo dice", async () => {
        api.getEmailSettings.mockRejectedValue(new Error("Server irraggiungibile"));
        renderWithUser(<EmailSettingsPanel />);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Server irraggiungibile");
        });
    });

    /** La password salvata non torna mai al browser: il campo resta vuoto e lo dice. */
    it("non riempie mai il campo password, ma avverte che una password c'è già", async () => {
        await renderLoaded();

        expect(screen.getByLabelText("Password")).toHaveValue("");
        expect(screen.getByLabelText("Password")).toHaveAttribute("placeholder", "•••• (invariata)");
    });

    it("mostra e nasconde la password scritta", async () => {
        await renderLoaded();

        const password = screen.getByLabelText("Password");
        expect(password).toHaveAttribute("type", "password");

        await userEvent.click(screen.getByRole("button", { name: "Mostra password" }));
        expect(password).toHaveAttribute("type", "text");

        await userEvent.click(screen.getByRole("button", { name: "Nascondi password" }));
        expect(password).toHaveAttribute("type", "password");
    });

    it("con l'invio attivo chiede host, utente ed email mittente", async () => {
        const host = await renderLoaded();

        await userEvent.clear(host);
        await userEvent.click(saveButton());

        expect(toast.error).toHaveBeenCalledWith("Specifica almeno host, utente ed email mittente");
        expect(api.updateEmailSettings).not.toHaveBeenCalled();
    });

    it("rifiuta una porta fuori intervallo", async () => {
        await renderLoaded();

        await userEvent.clear(screen.getByLabelText("Porta"));
        await userEvent.type(screen.getByLabelText("Porta"), "70000");
        await userEvent.click(saveButton());

        expect(toast.error).toHaveBeenCalledWith("La porta SMTP deve essere un numero valido");
        expect(api.updateEmailSettings).not.toHaveBeenCalled();
    });

    it("alla prima configurazione la password è obbligatoria", async () => {
        const host = await renderLoaded({ ...saved, passwordSet: false });

        await userEvent.type(host, ".it");
        await userEvent.click(saveButton());

        expect(toast.error).toHaveBeenCalledWith("Specifica una password per l'account email");
        expect(api.updateEmailSettings).not.toHaveBeenCalled();
    });

    /** Spegnere l'invio non deve richiedere un server valido: i campi sono disattivati. */
    it("disattivare l'invio salva senza validare i campi del server", async () => {
        await renderLoaded({ ...saved, host: "", username: "", fromEmail: "", passwordSet: false });

        await userEvent.click(screen.getByLabelText("Abilita invio email ai clienti"));
        expect(screen.getByLabelText("Host SMTP")).toBeDisabled();
        await userEvent.click(saveButton());

        await waitFor(() => {
            expect(api.updateEmailSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
        });
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("se il server rifiuta il salvataggio mostra il suo messaggio e lascia il form modificato", async () => {
        api.updateEmailSettings.mockRejectedValue(new Error("Host non raggiungibile"));
        const host = await renderLoaded();

        await userEvent.type(host, ".it");
        await userEvent.click(saveButton());

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Host non raggiungibile");
        });
        expect(host).toHaveValue("smtp.example.com.it");
        expect(saveButton()).toBeEnabled();
    });

    describe("prova di invio", () => {
        const testButton = () => screen.getByRole("button", { name: "Testa connessione" });

        /** La password salvata resta sul server: per provare l'invio va riscritta. */
        it("chiede di scrivere la password anche se ce n'è una salvata", async () => {
            await renderLoaded();

            await userEvent.click(testButton());

            expect(toast.error).toHaveBeenCalledWith(
                "Inserisci la password nel campo qui sopra per testare la connessione"
            );
            expect(api.testEmailConnection).not.toHaveBeenCalled();
        });

        it("chiede host e utente", async () => {
            await renderLoaded();

            await userEvent.clear(screen.getByLabelText("Utente"));
            await userEvent.click(testButton());

            expect(toast.error).toHaveBeenCalledWith("Per testare la connessione specifica almeno host e utente");
        });

        it("chiede un'email mittente valida", async () => {
            await renderLoaded();

            await userEvent.clear(screen.getByLabelText("Email mittente"));
            await userEvent.type(screen.getByLabelText("Email mittente"), "non-una-mail");
            await userEvent.click(testButton());

            expect(toast.error).toHaveBeenCalledWith("Inserisci un'email mittente valida per testare l'invio");
        });

        it("manda al server i valori scritti, ripuliti, e riporta la sua risposta", async () => {
            api.testEmailConnection.mockResolvedValue({ message: "Email di prova inviata a info@example.com" });
            const host = await renderLoaded();

            await userEvent.clear(host);
            await userEvent.type(host, " smtp.prova.it ");
            await userEvent.type(screen.getByLabelText("Password"), " segreta ");
            await userEvent.click(testButton());

            await waitFor(() => {
                expect(toast.success).toHaveBeenCalledWith("Email di prova inviata a info@example.com");
            });
            expect(api.testEmailConnection).toHaveBeenCalledWith({
                host: "smtp.prova.it",
                port: 587,
                secure: false,
                username: "lab",
                password: "segreta",
                fromName: "EasyLab",
                fromEmail: "info@example.com",
            });
            // Provare non vuol dire salvare.
            expect(api.updateEmailSettings).not.toHaveBeenCalled();
        });

        it("riporta l'errore del server quando l'invio non riesce", async () => {
            api.testEmailConnection.mockRejectedValue(new Error("Autenticazione SMTP rifiutata"));
            await renderLoaded();

            await userEvent.type(screen.getByLabelText("Password"), "segreta");
            await userEvent.click(testButton());

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith("Autenticazione SMTP rifiutata");
            });
        });

        it("con l'invio disattivato il pulsante non si può usare", async () => {
            await renderLoaded({ ...saved, enabled: false });

            expect(testButton()).toBeDisabled();
        });
    });
});
