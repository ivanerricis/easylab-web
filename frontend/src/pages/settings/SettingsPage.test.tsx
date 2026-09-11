import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Le sezioni hanno i loro test: qui ciascuna è un titolo, per vedere quale compare.
vi.mock("@/components/settings/themeSettingsSection", () => ({ default: () => <h2>Sezione tema</h2> }));
vi.mock("@/components/settings/securitySettingsSection", () => ({ default: () => <h2>Sezione sicurezza</h2> }));
vi.mock("@/components/settings/usersSettingsSection", () => ({ default: () => <h2>Sezione utenti</h2> }));
vi.mock("@/components/settings/companySettingsPanel", () => ({ default: () => <h2>Sezione azienda</h2> }));
vi.mock("@/components/settings/emailSettingsPanel", () => ({ default: () => <h2>Sezione email</h2> }));
vi.mock("@/components/settings/backupSettingsPanel", () => ({ default: () => <h2>Sezione backup</h2> }));
vi.mock("@/components/settings/updateSettingsPanel", () => ({ default: () => <h2>Sezione aggiornamenti</h2> }));
vi.mock("@/components/settings/logsSettingsPanel", () => ({ default: () => <h2>Sezione log</h2> }));

import { AuthProviderContext, initialAuthProviderState } from "@/components/auth-provider-context";
import SettingsPage from "./SettingsPage";
import type { UserDto } from "@/lib/api";
import { renderWithProviders } from "@/test/render";

const user: UserDto = {
    id: 2,
    username: "luigi",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
};

const renderPage = (route: string, currentUser: UserDto) =>
    renderWithProviders(
        <AuthProviderContext.Provider value={{ ...initialAuthProviderState, isLoading: false, user: currentUser }}>
            <SettingsPage />
        </AuthProviderContext.Provider>,
        { route }
    );

/** I pulsanti della barra laterale: sulla versione mobile c'è un select, nascosto dal CSS. */
const sectionButtons = () =>
    screen
        .getAllByRole("button")
        .map((button) => button.querySelector(".font-semibold")?.textContent)
        .filter(Boolean);

describe("SettingsPage", () => {
    it("apre il tema di default", () => {
        renderPage("/settings", user);

        expect(screen.getByRole("heading", { name: "Sezione tema" })).toBeInTheDocument();
        expect(document.title).toBe("Impostazioni · EasyLab");
    });

    /**
     * Le sezioni sulla macchina (backup, log, SMTP, aggiornamenti...) il backend le riserva
     * all'amministratore: a un altro utente risponderebbero solo 403, quindi non si mostrano.
     */
    it("a chi non è amministratore mostra solo tema e sicurezza", () => {
        renderPage("/settings", user);

        expect(sectionButtons()).toEqual(["Tema", "Sicurezza"]);
    });

    it("ignora nell'indirizzo una sezione che l'utente non può aprire", () => {
        renderPage("/settings?section=backup", user);

        expect(screen.getByRole("heading", { name: "Sezione tema" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Sezione backup" })).not.toBeInTheDocument();
    });

    it("all'amministratore mostra tutte le sezioni e apre quella dell'indirizzo", () => {
        renderPage("/settings?section=users", { ...user, isAdmin: true });

        expect(sectionButtons()).toEqual([
            "Tema",
            "Sicurezza",
            "Utenti",
            "Azienda",
            "Email",
            "Backup",
            "Aggiornamenti",
            "Log",
        ]);
        expect(screen.getByRole("heading", { name: "Sezione utenti" })).toBeInTheDocument();
    });

    it("cambia sezione dalla barra laterale", async () => {
        renderPage("/settings", { ...user, isAdmin: true });

        await userEvent.click(screen.getByRole("button", { name: /Log/ }));
        expect(screen.getByRole("heading", { name: "Sezione log" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /Backup/ }));
        expect(screen.getByRole("heading", { name: "Sezione backup" })).toBeInTheDocument();
    });

    it("ignora una sezione sconosciuta nell'indirizzo", () => {
        renderPage("/settings?section=inesistente", { ...user, isAdmin: true });

        expect(screen.getByRole("heading", { name: "Sezione tema" })).toBeInTheDocument();
    });
});
