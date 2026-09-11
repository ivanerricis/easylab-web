import { act, render, screen, waitFor } from "@testing-library/react";
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
        getMe.mockRejectedValue(new Error("401"));

        await renderProvider();

        expect(screen.getByText("anonimo")).toBeInTheDocument();
    });

    it("entra con un login senza secondo fattore", async () => {
        getMe.mockRejectedValue(new Error("401"));
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
        getMe.mockRejectedValue(new Error("401"));
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
});
