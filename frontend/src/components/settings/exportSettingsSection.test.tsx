import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getCustomersExportUrl: vi.fn((params?: object) => `clienti:${JSON.stringify(params ?? null)}`),
    getReportsExportUrl: vi.fn((params?: object) => `report:${JSON.stringify(params ?? null)}`),
    getInterventionsExportUrl: vi.fn((params?: object) => `interventi:${JSON.stringify(params ?? null)}`),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return { ...errors, ...api };
});

import ExportSettingsSection from "./exportSettingsSection";
import { renderWithProviders } from "@/test/render";

/**
 * Il download parte assegnando `window.location.href`: il file lo serve il browser, quindi il
 * test si limita a fissare l'indirizzo richiesto (i filtri scelti nella card ci finiscono
 * dentro) invece di simulare uno scaricamento.
 */
const stubLocation = () => {
    const location = { ...window.location, href: "" };
    Object.defineProperty(window, "location", { value: location, configurable: true });
    return location;
};

/**
 * Le tre card hanno gli stessi campi ("Stato", "Data di inizio"...): ogni ricerca parte dalla
 * card del proprio pulsante, altrimenti trova quella sbagliata o ne trova due.
 */
const cardOf = (exportButtonName: string) =>
    within(screen.getByRole("button", { name: exportButtonName }).closest("[data-slot='card']") as HTMLElement);

describe("ExportSettingsSection", () => {
    beforeEach(() => {
        api.getCustomersExportUrl.mockClear();
        api.getReportsExportUrl.mockClear();
        api.getInterventionsExportUrl.mockClear();
    });

    it("esporta l'anagrafica clienti senza filtri", async () => {
        const location = stubLocation();
        renderWithProviders(<ExportSettingsSection />);

        await userEvent.click(screen.getByRole("button", { name: "Esporta clienti" }));

        expect(api.getCustomersExportUrl).toHaveBeenCalledWith();
        expect(location.href).toBe("clienti:null");
    });

    it("esporta tutto l'archivio quando non si tocca niente", async () => {
        const location = stubLocation();
        renderWithProviders(<ExportSettingsSection />);

        await userEvent.click(screen.getByRole("button", { name: "Esporta report" }));
        expect(location.href).toBe('report:{"visibility":"all"}');

        await userEvent.click(screen.getByRole("button", { name: "Esporta interventi" }));
        expect(location.href).toBe('interventi:{"status":"all","type":"all"}');
    });

    /** Il filtro della vecchia pagina Report non si è perso: qui è esplicito. */
    it("passa stato e periodo scelti nella card dei report", async () => {
        const location = stubLocation();
        renderWithProviders(<ExportSettingsSection />);
        const card = cardOf("Esporta report");

        await userEvent.click(card.getByRole("combobox", { name: /Stato/ }));
        // Il menù del Select vive in un portale, fuori dalla card: si cerca su tutto lo schermo.
        await userEvent.click(screen.getByRole("option", { name: "Solo chiusi" }));
        await userEvent.type(card.getByLabelText("Data di inizio"), "2026-01-01");
        await userEvent.type(card.getByLabelText("Data di fine"), "2026-01-31");
        await userEvent.click(screen.getByRole("button", { name: "Esporta report" }));

        expect(location.href).toBe('report:{"visibility":"closed","dateFrom":"2026-01-01","dateTo":"2026-01-31"}');
    });

    it("passa stato, tipo e periodo scelti nella card degli interventi", async () => {
        const location = stubLocation();
        renderWithProviders(<ExportSettingsSection />);
        const card = cardOf("Esporta interventi");

        await userEvent.click(card.getByRole("combobox", { name: /Stato/ }));
        await userEvent.click(screen.getByRole("option", { name: "Completato" }));
        await userEvent.click(card.getByRole("combobox", { name: /Tipo/ }));
        await userEvent.click(screen.getByRole("option", { name: "Intervento in sede" }));
        await userEvent.type(card.getByLabelText("Data di inizio"), "2026-02-01");
        await userEvent.click(screen.getByRole("button", { name: "Esporta interventi" }));

        expect(location.href).toBe(
            'interventi:{"status":"completato","type":"intervento_sede","dateFrom":"2026-02-01"}'
        );
    });
});
