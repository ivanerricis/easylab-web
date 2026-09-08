import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

// L'API è mockata al confine di `@/lib/api`, che è come la importa tutto il resto dell'app.
const login = vi.fn();
const verifyTwoFactorLogin = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        login: (...args: unknown[]) => login(...args),
        verifyTwoFactorLogin: (...args: unknown[]) => verifyTwoFactorLogin(...args),
        logout: vi.fn(),
        getMe: vi.fn().mockRejectedValue(new Error("nessuna sessione")),
    };
});

import { AxiosError, AxiosHeaders } from "axios";
import { AuthProvider } from "@/components/auth-provider";
import LoginPage from "./LoginPage";

const user = {
    id: 1,
    username: "mario",
    createdAt: new Date("2026-01-01").toISOString(),
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: true,
};

const buildAxiosError = (message: string, status: number) => {
    const config = { headers: new AxiosHeaders() };
    return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, {
        data: { message },
        status,
        statusText: "Error",
        headers: {},
        config,
    });
};

const renderLoginPage = () =>
    render(
        <MemoryRouter>
            <AuthProvider>
                <LoginPage />
            </AuthProvider>
        </MemoryRouter>
    );

const submitCredentials = async () => {
    await userEvent.type(screen.getByLabelText("Nome utente"), "mario");
    await userEvent.type(screen.getByLabelText("Password"), "segreta1!");
    await userEvent.click(screen.getByRole("button", { name: /Accedi/ }));
};

describe("LoginPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("entra direttamente quando la 2FA non è attiva", async () => {
        login.mockResolvedValue({ status: "authenticated", user: { ...user, twoFactorEnabled: false } });

        renderLoginPage();
        await submitCredentials();

        await waitFor(() => {
            expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
        });
        expect(verifyTwoFactorLogin).not.toHaveBeenCalled();
    });

    it("chiede il codice invece di entrare quando la 2FA è attiva", async () => {
        login.mockResolvedValue({ status: "twoFactorRequired", challengeId: "abc123" });

        renderLoginPage();
        await submitCredentials();

        expect(await screen.findByLabelText("Codice di verifica")).toBeInTheDocument();
        // Nessun passaggio all'app finché il secondo fattore non è stato verificato: è la
        // ragione per cui la 2FA esiste, e qui sarebbe silenziosamente aggirabile.
        expect(navigate).not.toHaveBeenCalled();
    });

    it("porta nell'app dopo il codice corretto, passando il challenge ricevuto", async () => {
        login.mockResolvedValue({ status: "twoFactorRequired", challengeId: "abc123" });
        verifyTwoFactorLogin.mockResolvedValue(user);

        renderLoginPage();
        await submitCredentials();

        await userEvent.type(await screen.findByLabelText("Codice di verifica"), "123456");
        await userEvent.click(screen.getByRole("button", { name: /Verifica/ }));

        await waitFor(() => {
            expect(verifyTwoFactorLogin).toHaveBeenCalledWith("abc123", "123456");
        });
        expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    });

    it("lascia riprovare quando il codice è sbagliato ma il challenge è ancora aperto", async () => {
        login.mockResolvedValue({ status: "twoFactorRequired", challengeId: "abc123" });
        verifyTwoFactorLogin.mockRejectedValue(buildAxiosError("Codice non valido", 401));

        renderLoginPage();
        await submitCredentials();

        await userEvent.type(await screen.findByLabelText("Codice di verifica"), "000000");
        await userEvent.click(screen.getByRole("button", { name: /Verifica/ }));

        await waitFor(() => {
            expect(screen.getByLabelText("Codice di verifica")).toHaveValue("");
        });
        expect(screen.getByLabelText("Codice di verifica")).toBeInTheDocument();
    });

    /**
     * Il 410 dice che il challenge non esiste più — scaduto, o bruciato da troppi tentativi.
     * Restare sul campo del codice lascerebbe l'utente a insistere su qualcosa che non può
     * più funzionare, senza capire perché.
     */
    it("riporta alla password quando il challenge non esiste più", async () => {
        login.mockResolvedValue({ status: "twoFactorRequired", challengeId: "abc123" });
        verifyTwoFactorLogin.mockRejectedValue(buildAxiosError("Troppi codici errati. Ripeti l'accesso.", 410));

        renderLoginPage();
        await submitCredentials();

        await userEvent.type(await screen.findByLabelText("Codice di verifica"), "000000");
        await userEvent.click(screen.getByRole("button", { name: /Verifica/ }));

        expect(await screen.findByLabelText("Nome utente")).toBeInTheDocument();
        expect(screen.queryByLabelText("Codice di verifica")).not.toBeInTheDocument();
    });

    it("permette di passare a un codice di recupero", async () => {
        login.mockResolvedValue({ status: "twoFactorRequired", challengeId: "abc123" });

        renderLoginPage();
        await submitCredentials();

        await userEvent.click(await screen.findByRole("button", { name: "Usa un codice di recupero" }));

        expect(screen.getByLabelText("Codice di recupero")).toBeInTheDocument();
    });
});
