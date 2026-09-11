import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/pages/auth/ForcePasswordChangePage", () => ({
    default: () => <p>Imposta una nuova password</p>,
}));

import { AuthProviderContext, initialAuthProviderState } from "./auth-provider-context";
import RequireAuth from "./require-auth";
import type { UserDto } from "@/lib/api";

const user: UserDto = {
    id: 1,
    username: "mario",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
};

const LoginProbe = () => {
    const location = useLocation();
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    return <p>Login, provenienza: {from}</p>;
};

const renderAt = (path: string, state: { user: UserDto | null; isLoading: boolean }) =>
    render(
        <AuthProviderContext.Provider value={{ ...initialAuthProviderState, ...state }}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/login" element={<LoginProbe />} />
                    <Route element={<RequireAuth />}>
                        <Route path="/reports" element={<p>Pagina report</p>} />
                    </Route>
                </Routes>
            </MemoryRouter>
        </AuthProviderContext.Provider>
    );

describe("RequireAuth", () => {
    it("mostra il caricamento finché la sessione non è verificata", () => {
        renderAt("/reports", { user: null, isLoading: true });

        expect(screen.getByRole("status")).toHaveTextContent("Caricamento in corso");
        expect(screen.queryByText("Pagina report")).not.toBeInTheDocument();
    });

    it("manda al login chi non è autenticato, ricordando da dove veniva", () => {
        renderAt("/reports", { user: null, isLoading: false });

        expect(screen.getByText("Login, provenienza: /reports")).toBeInTheDocument();
    });

    /** Una password generata non deve dare accesso all'app, nemmeno a una pagina. */
    it("impone il cambio password prima di qualunque pagina", () => {
        renderAt("/reports", { user: { ...user, mustChangePassword: true }, isLoading: false });

        expect(screen.getByText("Imposta una nuova password")).toBeInTheDocument();
        expect(screen.queryByText("Pagina report")).not.toBeInTheDocument();
    });

    it("mostra la pagina a chi è autenticato", () => {
        renderAt("/reports", { user, isLoading: false });

        expect(screen.getByText("Pagina report")).toBeInTheDocument();
    });
});
