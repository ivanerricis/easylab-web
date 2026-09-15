import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getCompanySettings: vi.fn(),
    updateCompanySettings: vi.fn(),
    getLogoStatus: vi.fn(),
    uploadLogo: vi.fn(),
    resetLogo: vi.fn(),
    listLogFiles: vi.fn(),
    listLogEntries: vi.fn(),
    getLogRetention: vi.fn(),
    updateLogRetention: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forwarded = Object.fromEntries(
        Object.keys(api).map((name) => [
            name,
            (...args: unknown[]) => (api[name as keyof typeof api] as (...a: unknown[]) => unknown)(...args),
        ])
    );
    return { ...errors, ...forwarded, getLogDownloadUrl: (day: string) => `/logs/${day}/download` };
});

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import CompanySettingsPanel from "./companySettingsPanel";
import LogsSettingsPanel from "./logsSettingsPanel";
import { renderWithProviders } from "@/test/render";

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe("CompanySettingsPanel", () => {
    const company = {
        name: "EasyLab",
        email: "info@easylab.it",
        address: "Via Roma 1",
        phone: "06 123456",
        timeZone: "Europe/Rome",
    };

    beforeEach(() => {
        api.getCompanySettings.mockResolvedValue(company);
        api.getLogoStatus.mockResolvedValue({ hasCustomLogo: false, updatedAt: null });
        api.updateCompanySettings.mockImplementation(async (payload: object) => payload);
    });

    const renderPanel = async () => {
        renderWithProviders(<CompanySettingsPanel />);
        await waitFor(() => {
            expect(screen.getByLabelText("Nome")).toHaveValue("EasyLab");
        });
    };

    it("il nome dell'azienda è obbligatorio", async () => {
        await renderPanel();

        await userEvent.clear(screen.getByLabelText("Nome"));
        await userEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));

        expect(toast.error).toHaveBeenCalledWith("Il nome dell'azienda è obbligatorio");
        expect(api.updateCompanySettings).not.toHaveBeenCalled();
    });

    it("salva i dati ripuliti e torna pulito", async () => {
        await renderPanel();
        const save = screen.getByRole("button", { name: "Salva impostazioni" });
        expect(save).toBeDisabled();

        await userEvent.type(screen.getByLabelText("Nome"), "  ");
        await userEvent.click(save);

        await waitFor(() => {
            expect(api.updateCompanySettings).toHaveBeenCalledWith(company);
        });
        expect(save).toBeDisabled();
    });

    it("salva il fuso orario scelto, nel suo nome canonico", async () => {
        await renderPanel();
        const timeZone = screen.getByLabelText("Fuso orario");
        expect(timeZone).toHaveValue("Europe/Rome");
        expect(screen.getByText(/Adesso lì sono le/)).toBeInTheDocument();

        await userEvent.clear(timeZone);
        await userEvent.type(timeZone, "asia/tokyo");
        await userEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));

        await waitFor(() => {
            expect(api.updateCompanySettings).toHaveBeenCalledWith({ ...company, timeZone: "Asia/Tokyo" });
        });
    });

    it("rifiuta un fuso orario inventato senza chiamare il server", async () => {
        await renderPanel();
        const timeZone = screen.getByLabelText("Fuso orario");

        await userEvent.clear(timeZone);
        await userEvent.type(timeZone, "Europa/Roma");

        expect(timeZone).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText(/Fuso orario non riconosciuto/)).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));

        expect(toast.error).toHaveBeenCalledWith("Scegli un fuso orario dall'elenco, per esempio Europe/Rome");
        expect(api.updateCompanySettings).not.toHaveBeenCalled();
    });

    /** Il limite è anche sul server, ma così non si carica per niente un file da 20 MB. */
    it("rifiuta un logo più grande di 5 MB prima di caricarlo", async () => {
        await renderPanel();
        const tooBig = new File(["x"], "logo.png", { type: "image/png" });
        Object.defineProperty(tooBig, "size", { value: 6 * 1024 * 1024 });

        fireEvent.change(screen.getByLabelText("Carica nuovo logo"), { target: { files: [tooBig] } });

        expect(toast.error).toHaveBeenCalledWith("Il file supera la dimensione massima di 5 MB");
        expect(api.uploadLogo).not.toHaveBeenCalled();
    });

    it("carica il logo e poi permette di tornare a quello predefinito", async () => {
        api.uploadLogo.mockResolvedValue({ hasCustomLogo: true, updatedAt: "2026-09-11T10:00:00.000Z" });
        api.resetLogo.mockResolvedValue({ hasCustomLogo: false, updatedAt: null });
        await renderPanel();
        expect(screen.getByRole("button", { name: "Ripristina logo predefinito" })).toBeDisabled();

        const logo = new File(["png"], "logo.png", { type: "image/png" });
        await userEvent.upload(screen.getByLabelText("Carica nuovo logo"), logo);

        await waitFor(() => {
            expect(screen.getByText("Logo personalizzato attivo")).toBeInTheDocument();
        });
        expect(api.uploadLogo).toHaveBeenCalledWith(logo);

        await userEvent.click(screen.getByRole("button", { name: "Ripristina logo predefinito" }));

        await waitFor(() => {
            expect(screen.getByText("Logo predefinito attivo")).toBeInTheDocument();
        });
    });
});

describe("LogsSettingsPanel", () => {
    const entry = {
        timestamp: "2026-09-11T10:00:00.000Z",
        ip: "10.0.0.5",
        user: "mario",
        action: "POST /api/reports",
        status: 201,
        error: null,
    };

    beforeEach(() => {
        api.getLogRetention.mockResolvedValue({ maxDays: 7 });
    });

    it("dice quando sul server non ci sono log", async () => {
        api.listLogFiles.mockResolvedValue([]);
        renderWithProviders(<LogsSettingsPanel />);

        expect(await screen.findByText("Nessun log disponibile sul server.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Scarica log selezionato" })).toBeDisabled();
    });

    it("apre il giorno più recente e ne mostra le voci", async () => {
        api.listLogFiles.mockResolvedValue([
            { dayKey: "2026-09-11", sizeBytes: 4096, updatedAt: "2026-09-11T10:00:00.000Z" },
            { dayKey: "2026-09-10", sizeBytes: 2048, updatedAt: "2026-09-10T10:00:00.000Z" },
        ]);
        api.listLogEntries.mockResolvedValue({ items: [entry], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 });
        renderWithProviders(<LogsSettingsPanel />);

        const row = (await within(await screen.findByRole("table")).findByText("POST /api/reports")).closest("tr");
        expect(row).toHaveTextContent("10.0.0.5");
        expect(row).toHaveTextContent("mario");
        expect(api.listLogEntries).toHaveBeenCalledWith("2026-09-11", { page: 1, pageSize: 10, search: "" });
    });

    it("scarica il log del giorno selezionato", async () => {
        api.listLogFiles.mockResolvedValue([
            { dayKey: "2026-09-11", sizeBytes: 4096, updatedAt: "2026-09-11T10:00:00.000Z" },
        ]);
        api.listLogEntries.mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 10, totalPages: 1 });
        const location = { ...window.location, href: "" };
        Object.defineProperty(window, "location", { value: location, configurable: true });
        renderWithProviders(<LogsSettingsPanel />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Scarica log selezionato" })).toBeEnabled();
        });
        await userEvent.click(screen.getByRole("button", { name: "Scarica log selezionato" }));

        expect(location.href).toBe("/logs/2026-09-11/download");
    });

    it("carica la conservazione configurata e permette di salvarne una nuova", async () => {
        api.listLogFiles.mockResolvedValue([]);
        api.updateLogRetention.mockResolvedValue({ maxDays: 30 });
        renderWithProviders(<LogsSettingsPanel />);

        const retentionInput = await screen.findByLabelText("Giorni da conservare");
        await waitFor(() => expect(retentionInput).toHaveValue(7));

        await userEvent.clear(retentionInput);
        await userEvent.type(retentionInput, "30");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(api.updateLogRetention).toHaveBeenCalledWith(30);
        });
        expect(toast.success).toHaveBeenCalledWith("Conservazione log aggiornata");
    });

    it("non lascia salvare una conservazione fuori dall'intervallo 1-90", async () => {
        api.listLogFiles.mockResolvedValue([]);
        renderWithProviders(<LogsSettingsPanel />);

        const retentionInput = await screen.findByLabelText("Giorni da conservare");
        await waitFor(() => expect(retentionInput).toHaveValue(7));

        await userEvent.clear(retentionInput);
        await userEvent.type(retentionInput, "91");

        expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
        expect(api.updateLogRetention).not.toHaveBeenCalled();
    });
});
