import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return { ...errors, changeOwnPassword: vi.fn() };
});

const toastError = vi.fn();

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));

import { AuthProviderContext, initialAuthProviderState } from "./auth-provider-context";
import MainSidebar from "./main-sidebar";
import { SidebarProvider } from "./ui/sidebar";
import { UserBadge } from "./user-badge";
import UnhandledErrorPage from "@/pages/UnhandledErrorPage";
import type { UserDto } from "@/lib/api";
import { renderWithProviders } from "@/test/render";

const user: UserDto = {
    id: 1,
    username: "mario",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("MainSidebar", () => {
    const renderSidebar = (route: string) =>
        renderWithProviders(
            <SidebarProvider>
                <MainSidebar />
            </SidebarProvider>,
            { route }
        );

    /** Anche dentro una scheda (`/clients/3`) la voce della sezione resta evidenziata. */
    it("evidenzia la sezione corrente, anche nelle sottopagine", () => {
        renderSidebar("/clients/3");

        const active = screen.getAllByRole("button").filter((button) => button.getAttribute("data-active") === "true");
        expect(active.map((button) => button.textContent)).toEqual(["Clienti"]);
    });

    it("non confonde sezioni con lo stesso prefisso", () => {
        // "/reportsx" non è la sezione Report.
        renderSidebar("/reportsx");

        expect(screen.getAllByRole("button").filter((button) => button.getAttribute("data-active") === "true")).toEqual(
            []
        );
    });

    it("naviga alla voce scelta, impostazioni comprese", async () => {
        renderSidebar("/dashboard");

        await userEvent.click(screen.getByRole("button", { name: "Tecnici esterni" }));
        await userEvent.click(screen.getByRole("button", { name: "Impostazioni" }));

        expect(navigate).toHaveBeenCalledWith("/technicians");
        expect(navigate).toHaveBeenCalledWith("/settings");
    });
});

describe("UserBadge", () => {
    const logout = vi.fn();

    const renderBadge = (currentUser: UserDto | null) =>
        renderWithProviders(
            <AuthProviderContext.Provider
                value={{ ...initialAuthProviderState, isLoading: false, user: currentUser, logout }}
            >
                <UserBadge />
            </AuthProviderContext.Provider>
        );

    it("non mostra nulla senza utente", () => {
        const { container } = renderBadge(null);

        expect(container).toBeEmptyDOMElement();
    });

    it("mostra le iniziali e il nome dell'utente", async () => {
        renderBadge(user);

        const trigger = screen.getByRole("button", { name: "Account utente" });
        expect(trigger).toHaveTextContent("MA");

        await userEvent.click(trigger);

        expect(screen.getByText("mario", { selector: "span" })).toBeInTheDocument();
    });

    it("offre la gestione utenti solo agli amministratori", async () => {
        const { unmount } = renderBadge(user);
        await userEvent.click(screen.getByRole("button", { name: "Account utente" }));
        expect(screen.queryByRole("menuitem", { name: "Gestisci utenti" })).not.toBeInTheDocument();
        unmount();

        renderBadge({ ...user, isAdmin: true });
        await userEvent.click(screen.getByRole("button", { name: "Account utente" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Gestisci utenti" }));

        expect(navigate).toHaveBeenCalledWith("/settings?section=users");
    });

    it("apre il cambio password", async () => {
        renderBadge(user);

        await userEvent.click(screen.getByRole("button", { name: "Account utente" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Cambia password" }));

        expect(await screen.findByRole("dialog", { name: "Cambia password" })).toBeInTheDocument();
    });

    it("esce, e segnala se non ci riesce", async () => {
        logout.mockRejectedValue(new Error("Rete non raggiungibile"));
        renderBadge(user);

        await userEvent.click(screen.getByRole("button", { name: "Account utente" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Esci" }));

        expect(logout).toHaveBeenCalled();
        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Rete non raggiungibile");
        });
    });
});

describe("UnhandledErrorPage", () => {
    it("usa Riprova per richiamare chi l'ha mostrata", async () => {
        const onRetry = vi.fn();
        renderWithProviders(<UnhandledErrorPage onRetry={onRetry} />);

        expect(screen.getByText("Si è verificato un errore inatteso")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

        expect(onRetry).toHaveBeenCalled();
    });

    it("senza chi la richiami, Riprova ricarica la pagina", async () => {
        const reload = vi.fn();
        Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
        renderWithProviders(<UnhandledErrorPage title="Pagina rotta" message="Dettagli" />);

        expect(screen.getByText("Pagina rotta")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

        expect(reload).toHaveBeenCalled();
    });
});
