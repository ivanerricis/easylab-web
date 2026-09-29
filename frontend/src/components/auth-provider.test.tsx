import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMe = vi.fn();
const login = vi.fn();
const logout = vi.fn();
const verifyTwoFactorLogin = vi.fn();

vi.mock("@/lib/api", () => ({
    getMe: (...args: unknown[]) => getMe(...args),
    login: (...args: unknown[]) => login(...args),
    logout: (...args: unknown[]) => logout(...args),
    verifyTwoFactorLogin: (...args: unknown[]) => verifyTwoFactorLogin(...args),
}));

const setUnauthorizedHandler = vi.fn();

vi.mock("@/lib/api/client", () => ({
    setUnauthorizedHandler: (...args: unknown[]) => setUnauthorizedHandler(...args),
}));

import { AuthProvider } from "./auth-provider";
import type { AuthProviderState } from "./auth-provider-context";
import { useAuth } from "./use-auth";

const user = {
    id: 1,
    username: "mario",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
    twoFactorSetupRequired: false,
};

/**
 * Espone il contesto al test e scrive a schermo lo stato, per le asserzioni. Il contesto passa
 * da un effetto e non da un assegnamento nel render: le regole degli hook vietano di scrivere
 * variabili esterne durante il render.
 */
const authRef: { current: AuthProviderState | null } = { current: null };
const Probe = () => {
    const auth = useAuth();
    useEffect(() => {
        authRef.current = auth;
    });
    return <p>{auth.isLoading ? "caricamento" : (auth.user?.username ?? "anonimo")}</p>;
};

const auth = () => authRef.current as AuthProviderState;

/** Come arriva da axios una risposta: `getApiErrorStatus` guarda solo questi campi. */
const httpError = (status: number) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status, data: {} },
    });
const unauthorizedError = () => httpError(401);
/** Nessuna risposta: rete assente o server irraggiungibile. */
const networkError = () =>
    Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK", response: undefined });

const renderProvider = async () => {
    render(
        <AuthProvider>
            <Probe />
        </AuthProvider>
    );
    await waitFor(() => {
        expect(screen.queryByText("caricamento")).not.toBeInTheDocument();
    });
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("AuthProvider", () => {
    it("recupera la sessione esistente al montaggio", async () => {
        getMe.mockResolvedValue(user);

        await renderProvider();

        expect(screen.getByText("mario")).toBeInTheDocument();
    });

    it("resta anonimo se non c'è una sessione", async () => {
        getMe.mockRejectedValue(unauthorizedError());

        await renderProvider();

        expect(screen.getByText("anonimo")).toBeInTheDocument();
    });

    it("entra con un login senza secondo fattore", async () => {
        getMe.mockRejectedValue(unauthorizedError());
        login.mockResolvedValue({ status: "authenticated", user });
        await renderProvider();

        await act(async () => {
            await auth().login("mario", "segreta1!");
        });

        expect(screen.getByText("mario")).toBeInTheDocument();
    });

    /**
     * Se il challenge scrivesse l'utente, `RequireAuth` aprirebbe l'app prima che il secondo
     * fattore sia stato verificato.
     */
    it("non considera autenticato chi deve ancora dare il secondo fattore", async () => {
        getMe.mockRejectedValue(unauthorizedError());
        login.mockResolvedValue({ status: "twoFactorRequired", challengeId: "abc" });
        await renderProvider();

        let result: unknown;
        await act(async () => {
            result = await auth().login("mario", "segreta1!");
        });

        expect(result).toEqual({ status: "twoFactorRequired", challengeId: "abc" });
        expect(screen.getByText("anonimo")).toBeInTheDocument();

        verifyTwoFactorLogin.mockResolvedValue(user);
        await act(async () => {
            await auth().completeTwoFactorLogin("abc", "123456");
        });

        expect(verifyTwoFactorLogin).toHaveBeenCalledWith("abc", "123456");
        expect(screen.getByText("mario")).toBeInTheDocument();
    });

    it("esce anche se la chiamata di logout fallisce", async () => {
        getMe.mockResolvedValue(user);
        logout.mockRejectedValue(new Error("rete non raggiungibile"));
        await renderProvider();

        await act(async () => {
            await auth()
                .logout()
                .catch(() => undefined);
        });

        expect(screen.getByText("anonimo")).toBeInTheDocument();
    });

    /**
     * `client.ts` chiama questo handler su un 401 fuori da `/auth/` (sessione scaduta o
     * revocata da Sicurezza): deve bastargli ad azzerare l'utente, che è ciò che poi porta
     * `RequireAuth` al login. Senza questa registrazione l'interceptor non ha nessuno da
     * avvisare, ed è esattamente il difetto che D1 corregge.
     */
    it("registra in client.ts un handler che azzera l'utente", async () => {
        getMe.mockResolvedValue(user);
        await renderProvider();

        expect(screen.getByText("mario")).toBeInTheDocument();
        expect(setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function));

        const handler = setUnauthorizedHandler.mock.calls.at(-1)?.[0] as () => void;

        await act(async () => {
            handler();
        });

        expect(screen.getByText("anonimo")).toBeInTheDocument();
    });

    /**
     * Prima qualunque errore di `/auth/me` valeva "non autenticato": con la rete assente o il
     * server in riavvio si finiva al login con una sessione valida. Ora solo il 401.
     */
    it("con la rete assente non manda al login: mostra l'errore con Riprova", async () => {
        getMe.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(user);
        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        expect(await screen.findByRole("heading", { name: "Impossibile contattare il server" })).toBeInTheDocument();
        expect(
            screen.getByText("Connessione al server non riuscita. Controlla la rete e riprova.")
        ).toBeInTheDocument();
        expect(screen.queryByText("anonimo")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

        expect(await screen.findByText("mario")).toBeInTheDocument();
        expect(getMe).toHaveBeenCalledTimes(2);
    });

    it("con un errore del server mostra l'errore; se poi risponde 401 porta al login", async () => {
        getMe.mockRejectedValueOnce(httpError(502)).mockRejectedValueOnce(unauthorizedError());
        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));

        expect(await screen.findByText("anonimo")).toBeInTheDocument();
    });

    it("un refresh fallito per la rete non butta fuori chi ha già una sessione", async () => {
        getMe.mockResolvedValueOnce(user).mockRejectedValueOnce(networkError());
        await renderProvider();

        await act(async () => {
            await auth().refresh();
        });

        expect(screen.getByText("mario")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Riprova" })).not.toBeInTheDocument();
    });

    it("toglie l'handler allo smontaggio", async () => {
        getMe.mockResolvedValue(user);
        const { unmount } = render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );
        await waitFor(() => {
            expect(screen.queryByText("caricamento")).not.toBeInTheDocument();
        });

        unmount();

        expect(setUnauthorizedHandler).toHaveBeenLastCalledWith(null);
    });
});
