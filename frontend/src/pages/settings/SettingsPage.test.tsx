import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Le sezioni hanno i loro test: qui ciascuna è un titolo, per vedere quale compare.
vi.mock("@/components/settings/themeSettingsSection", () => ({ default: () => <h2>Sezione tema</h2> }));
vi.mock("@/components/settings/securitySettingsSection", () => ({ default: () => <h2>Sezione sicurezza</h2> }));
vi.mock("@/components/settings/usersSettingsSection", () => ({ default: () => <h2>Sezione utenti</h2> }));
// Azienda segnala le modifiche non salvate come il pannello vero: qui con un pulsante.
vi.mock("@/components/settings/companySettingsPanel", () => ({
    default: ({ onDirtyChange }: { onDirtyChange?: (isDirty: boolean) => void }) => (
        <>
            <h2>Sezione azienda</h2>
            <button type="button" onClick={() => onDirtyChange?.(true)}>
                Scrivi nel modulo
            </button>
        </>
    ),
}));
vi.mock("@/components/settings/emailSettingsPanel", () => ({ default: () => <h2>Sezione email</h2> }));
vi.mock("@/components/settings/exportSettingsSection", () => ({ default: () => <h2>Sezione esportazione</h2> }));
vi.mock("@/components/settings/backupSettingsPanel", () => ({ default: () => <h2>Sezione backup</h2> }));
vi.mock("@/components/settings/updateSettingsPanel", () => ({ default: () => <h2>Sezione aggiornamenti</h2> }));
vi.mock("@/components/settings/logsSettingsPanel", () => ({ default: () => <h2>Sezione log</h2> }));

import { Link } from "react-router-dom";
import { AuthProviderContext, initialAuthProviderState } from "@/components/auth-provider-context";
import SettingsPage from "./SettingsPage";
import type { UserDto } from "@/lib/api";
import { currentLocation } from "@/test/currentLocation";
import { LocationProbe } from "@/test/locationProbe";
import { renderWithProviders } from "@/test/render";

const user: UserDto = {
    id: 2,
    username: "luigi",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
    twoFactorSetupRequired: false,
};

const renderPage = (route: string, currentUser: UserDto) =>
    renderWithProviders(
        <AuthProviderContext.Provider value={{ ...initialAuthProviderState, isLoading: false, user: currentUser }}>
            <SettingsPage />
            {/* Al posto di una voce della barra laterale dell'app, che sta in MainLayout. */}
            <Link to="/reports">Report</Link>
            <LocationProbe />
        </AuthProviderContext.Provider>,
        { route }
    );

/** I pulsanti della barra laterale: sulla versione mobile c'è un select, nascosto dal CSS. */
const sectionButtons = () =>
    within(screen.getByRole("navigation", { name: "Sezioni delle impostazioni" }))
        .getAllByRole("button")
        .map((button) => button.textContent);

describe("SettingsPage", () => {
    it("apre il tema di default", async () => {
        renderPage("/settings", user);

        // `findBy`: le sezioni sono caricate con `lazy`.
        expect(await screen.findByRole("heading", { name: "Sezione tema" })).toBeInTheDocument();
        expect(document.title).toBe("Impostazioni · EasyLab");
    });

    /**
     * Le sezioni sulla macchina (backup, log, SMTP, aggiornamenti...) il backend le riserva
     * all'amministratore: a un altro utente risponderebbero solo 403, quindi non si mostrano.
     */
    it("a chi non è amministratore mostra solo tema, sicurezza ed esportazione", () => {
        renderPage("/settings", user);

        // L'esportazione CSV c'è per tutti: le rotte `export.csv` non sono riservate
        // all'amministratore, e prima del trasloco in Impostazioni il pulsante stava nelle
        // pagine Clienti e Report, che ogni utente apre.
        expect(sectionButtons()).toEqual(["Tema", "Sicurezza", "Esportazione"]);
    });

    it("ignora nell'indirizzo una sezione che l'utente non può aprire", async () => {
        renderPage("/settings?section=backup", user);

        expect(await screen.findByRole("heading", { name: "Sezione tema" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Sezione backup" })).not.toBeInTheDocument();
    });

    it("all'amministratore mostra tutte le sezioni e apre quella dell'indirizzo", async () => {
        renderPage("/settings?section=users", { ...user, isAdmin: true });

        expect(sectionButtons()).toEqual([
            "Tema",
            "Sicurezza",
            "Utenti",
            "Azienda",
            "Email",
            "Esportazione",
            "Backup",
            "Aggiornamenti",
            "Log",
        ]);
        expect(await screen.findByRole("heading", { name: "Sezione utenti" })).toBeInTheDocument();
    });

    it("cambia sezione dalla barra laterale", async () => {
        renderPage("/settings", { ...user, isAdmin: true });

        await userEvent.click(screen.getByRole("button", { name: /Log/ }));
        expect(await screen.findByRole("heading", { name: "Sezione log" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /Backup/ }));
        expect(await screen.findByRole("heading", { name: "Sezione backup" })).toBeInTheDocument();
    });

    it("ignora una sezione sconosciuta nell'indirizzo", async () => {
        renderPage("/settings?section=inesistente", { ...user, isAdmin: true });

        expect(await screen.findByRole("heading", { name: "Sezione tema" })).toBeInTheDocument();
    });
});

describe("SettingsPage: modifiche non salvate", () => {
    const admin = { ...user, isAdmin: true };

    const openDirtyCompanySection = async () => {
        renderPage("/settings?section=company", admin);
        await userEvent.click(await screen.findByRole("button", { name: "Scrivi nel modulo" }));
    };

    it("senza modifiche cambia sezione senza chiedere", async () => {
        renderPage("/settings?section=company", admin);
        await screen.findByRole("heading", { name: "Sezione azienda" });

        await userEvent.click(screen.getByRole("button", { name: /Log/ }));

        expect(await screen.findByRole("heading", { name: "Sezione log" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it('chiede prima di cambiare sezione, e "Continua a modificare" resta dove si è', async () => {
        await openDirtyCompanySection();

        await userEvent.click(screen.getByRole("button", { name: /Log/ }));

        expect(await screen.findByRole("dialog", { name: "Modifiche non salvate" })).toBeInTheDocument();
        // Il focus sul pulsante sicuro: un Invio di troppo non butta via il modulo.
        expect(screen.getByRole("button", { name: "Continua a modificare" })).toHaveFocus();

        await userEvent.click(screen.getByRole("button", { name: "Continua a modificare" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Sezione azienda" })).toBeInTheDocument();
        expect(currentLocation().params.section).toBe("company");
    });

    it('"Chiudi senza salvare" apre la sezione scelta', async () => {
        await openDirtyCompanySection();

        await userEvent.click(screen.getByRole("button", { name: /Log/ }));
        await userEvent.click(await screen.findByRole("button", { name: "Chiudi senza salvare" }));

        expect(await screen.findByRole("heading", { name: "Sezione log" })).toBeInTheDocument();
        expect(currentLocation().params.section).toBe("logs");
    });

    /** Le voci della barra laterale dell'app sono link: anche lasciare Impostazioni chiede. */
    it("chiede anche prima di seguire un link verso un'altra pagina", async () => {
        await openDirtyCompanySection();

        await userEvent.click(screen.getByRole("link", { name: "Report" }));

        expect(await screen.findByRole("dialog", { name: "Modifiche non salvate" })).toBeInTheDocument();
        expect(currentLocation().pathname).toBe("/settings");

        await userEvent.click(screen.getByRole("button", { name: "Chiudi senza salvare" }));

        expect(currentLocation().pathname).toBe("/reports");
    });

    it("un link senza modifiche in sospeso non chiede niente", async () => {
        renderPage("/settings?section=company", admin);
        await screen.findByRole("heading", { name: "Sezione azienda" });

        await userEvent.click(screen.getByRole("link", { name: "Report" }));

        expect(currentLocation().pathname).toBe("/reports");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("chiudere la scheda con modifiche in sospeso fa chiedere al browser", async () => {
        renderPage("/settings?section=company", admin);
        await screen.findByRole("heading", { name: "Sezione azienda" });

        const cleanEvent = new Event("beforeunload", { cancelable: true });
        fireEvent(window, cleanEvent);
        expect(cleanEvent.defaultPrevented).toBe(false);

        await userEvent.click(screen.getByRole("button", { name: "Scrivi nel modulo" }));

        const dirtyEvent = new Event("beforeunload", { cancelable: true });
        fireEvent(window, dirtyEvent);
        expect(dirtyEvent.defaultPrevented).toBe(true);
    });
});
