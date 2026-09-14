import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La mappa delle rotte di `App.tsx`: quale URL apre quale pagina, dove porta un URL
 * sconosciuto, e cosa vede chi non è entrato o deve ancora cambiare password o attivare la
 * 2FA. Le pagine sono segnaposto — ognuna ha i propri test — e il layout è ridotto a un
 * `Outlet`, perché qui interessa solo il percorso che porta a ciascuna.
 */
const getMe = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    getMe: () => getMe() as unknown,
}));

vi.mock("@/pages/MainLayout", async () => {
    const { createElement } = await import("react");
    const { Outlet } = await import("react-router-dom");
    return { MainLayout: () => createElement("div", { "data-testid": "layout" }, createElement(Outlet)) };
});

vi.mock("@/pages/auth/LoginPage", () => ({ default: () => "Pagina: login" }));
vi.mock("@/pages/dashboard/DashboardPage", () => ({ default: () => "Pagina: dashboard" }));
vi.mock("@/pages/reports/ReportsPage", () => ({ default: () => "Pagina: elenco report" }));
vi.mock("@/pages/reports/ReportPage", () => ({ default: () => "Pagina: scheda report" }));
vi.mock("@/pages/interventions/InterventionsPage", () => ({ default: () => "Pagina: elenco interventi" }));
vi.mock("@/pages/interventions/InterventionPage", () => ({ default: () => "Pagina: scheda intervento" }));
vi.mock("@/pages/customers/CustomersPage", () => ({ default: () => "Pagina: elenco clienti" }));
vi.mock("@/pages/customers/CustomerPage", () => ({ default: () => "Pagina: scheda cliente" }));
vi.mock("@/pages/collaborators/CollaboratorsPage", () => ({ default: () => "Pagina: elenco collaboratori" }));
vi.mock("@/pages/collaborators/CollaboratorPage", () => ({ default: () => "Pagina: scheda collaboratore" }));
vi.mock("@/pages/technicians/TechniciansPage", () => ({ default: () => "Pagina: elenco tecnici" }));
vi.mock("@/pages/technicians/TechnicianPage", () => ({ default: () => "Pagina: scheda tecnico" }));
vi.mock("@/pages/devices/DevicesPage", () => ({ default: () => "Pagina: dispositivi" }));
vi.mock("@/pages/issues/IssuesPage", () => ({ default: () => "Pagina: difetti" }));
vi.mock("@/pages/settings/SettingsPage", () => ({ default: () => "Pagina: impostazioni" }));

import App from "./App";
import type { UserDto } from "@/lib/api";

const user: UserDto = {
    id: 2,
    username: "mario",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
    twoFactorSetupRequired: false,
};

/** `App` usa `BrowserRouter`: l'URL di partenza è quello della finestra. */
const renderAt = (url: string) => {
    window.history.replaceState(null, "", url);
    return render(<App />);
};

beforeEach(() => {
    getMe.mockReset();
    localStorage.clear();
});

describe("rotte con un utente entrato", () => {
    beforeEach(() => {
        getMe.mockResolvedValue(user);
    });

    it.each([
        ["/dashboard", "Pagina: dashboard"],
        ["/reports", "Pagina: elenco report"],
        ["/reports/12", "Pagina: scheda report"],
        ["/interventions", "Pagina: elenco interventi"],
        ["/interventions/7", "Pagina: scheda intervento"],
        ["/clients", "Pagina: elenco clienti"],
        ["/clients/3", "Pagina: scheda cliente"],
        // Stessa pagina, aperta sulla tab degli interventi.
        ["/clients/3/interventions", "Pagina: scheda cliente"],
        ["/collaborators", "Pagina: elenco collaboratori"],
        ["/collaborators/5", "Pagina: scheda collaboratore"],
        ["/technicians", "Pagina: elenco tecnici"],
        ["/technicians/4", "Pagina: scheda tecnico"],
        ["/devices", "Pagina: dispositivi"],
        ["/issues", "Pagina: difetti"],
        ["/settings", "Pagina: impostazioni"],
    ])("%s apre %s dentro il layout", async (url, pageText) => {
        renderAt(url);

        expect(await screen.findByText(pageText)).toBeInTheDocument();
        expect(screen.getByTestId("layout")).toContainElement(screen.getByText(pageText));
    });

    it("la radice porta alla dashboard", async () => {
        renderAt("/");

        expect(await screen.findByText("Pagina: dashboard")).toBeInTheDocument();
        expect(window.location.pathname).toBe("/dashboard");
    });

    it("un indirizzo sconosciuto porta alla dashboard", async () => {
        renderAt("/pagina-che-non-esiste");

        expect(await screen.findByText("Pagina: dashboard")).toBeInTheDocument();
        expect(window.location.pathname).toBe("/dashboard");
    });

    it("/error mostra la pagina d'errore dentro il layout", async () => {
        renderAt("/error");

        expect(await screen.findByText("Si è verificato un errore inatteso")).toBeInTheDocument();
    });
});

describe("rotte prima di entrare", () => {
    it("senza sessione ogni pagina porta al login", async () => {
        getMe.mockRejectedValue(new Error("401"));
        renderAt("/reports/12");

        expect(await screen.findByText("Pagina: login")).toBeInTheDocument();
        expect(window.location.pathname).toBe("/login");
        expect(screen.queryByText("Pagina: scheda report")).not.toBeInTheDocument();
    });

    it("il login è raggiungibile senza sessione", async () => {
        getMe.mockRejectedValue(new Error("401"));
        renderAt("/login");

        expect(await screen.findByText("Pagina: login")).toBeInTheDocument();
    });

    it("con la password da cambiare mostra solo il cambio password, qualunque pagina si chieda", async () => {
        getMe.mockResolvedValue({ ...user, mustChangePassword: true });
        renderAt("/settings");

        expect(await screen.findByText("Imposta una nuova password")).toBeInTheDocument();
        expect(screen.queryByText("Pagina: impostazioni")).not.toBeInTheDocument();
        expect(screen.queryByTestId("layout")).not.toBeInTheDocument();
    });

    it("con la 2FA da attivare mostra solo la sua configurazione", async () => {
        getMe.mockResolvedValue({ ...user, isAdmin: true, twoFactorSetupRequired: true });
        renderAt("/settings");

        expect(await screen.findByText("Attiva la verifica in due passaggi")).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByText("Pagina: impostazioni")).not.toBeInTheDocument();
        });
    });
});
