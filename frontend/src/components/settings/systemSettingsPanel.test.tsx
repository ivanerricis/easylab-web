import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getSystemStatus: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forwarded = Object.fromEntries(
        Object.keys(api).map((name) => [
            name,
            (...args: unknown[]) => (api[name as keyof typeof api] as (...a: unknown[]) => unknown)(...args),
        ])
    );
    return { ...errors, ...forwarded };
});

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import SystemSettingsPanel from "./systemSettingsPanel";
import { renderWithProviders } from "@/test/render";

const GiB = 1024 * 1024 * 1024;
const diskLabel = "Disco del server (dati e backup)";

const status = {
    disks: [
        { key: "data", label: diskLabel, totalBytes: 100 * GiB, usedBytes: 40 * GiB, freeBytes: 60 * GiB, low: false },
    ],
    databaseSizeBytes: 5 * 1024 * 1024,
    checkedAt: "2026-10-16T08:00:00.000Z",
};

beforeEach(() => {
    vi.clearAllMocks();
    api.getSystemStatus.mockResolvedValue(status);
});

describe("SystemSettingsPanel", () => {
    it("mostra disco, database e ultimo controllo", async () => {
        renderWithProviders(<SystemSettingsPanel />);

        expect(await screen.findByText(diskLabel)).toBeInTheDocument();
        expect(screen.getByText("40.0 GB usati su 100.0 GB (40%)")).toBeInTheDocument();
        expect(screen.getByText("5.0 MB")).toBeInTheDocument();
        expect(screen.getByText(/Ultimo controllo:/)).toBeInTheDocument();
        expect(screen.queryByText(/Libera spazio o sposta i backup/)).not.toBeInTheDocument();
    });

    it("la barra mostra la percentuale usata", async () => {
        renderWithProviders(<SystemSettingsPanel />);

        const bar = await screen.findByRole("progressbar", { name: `Spazio usato su ${diskLabel}` });
        expect(bar).toHaveAttribute("aria-valuenow", "40");
        expect(bar).toHaveAttribute("aria-valuemin", "0");
        expect(bar).toHaveAttribute("aria-valuemax", "100");
    });

    it("con un disco in esaurimento mostra l'avviso", async () => {
        api.getSystemStatus.mockResolvedValue({
            ...status,
            disks: [{ ...status.disks[0], usedBytes: 98 * GiB, freeBytes: 1 * GiB, low: true }],
        });
        renderWithProviders(<SystemSettingsPanel />);

        expect(await screen.findByText(/Libera spazio o sposta i backup/)).toBeInTheDocument();
        expect(screen.getByText("Spazio in esaurimento")).toBeInTheDocument();
    });

    it('scrive "Non disponibile" se la dimensione del database è nulla', async () => {
        api.getSystemStatus.mockResolvedValue({ ...status, databaseSizeBytes: null });
        renderWithProviders(<SystemSettingsPanel />);

        expect(await screen.findByText("Non disponibile")).toBeInTheDocument();
    });

    it("senza dischi lo dice", async () => {
        api.getSystemStatus.mockResolvedValue({ ...status, disks: [] });
        renderWithProviders(<SystemSettingsPanel />);

        expect(await screen.findByText("Spazio su disco non disponibile su questo server.")).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("se la chiamata fallisce mostra un errore", async () => {
        api.getSystemStatus.mockRejectedValue(new Error("boom"));
        renderWithProviders(<SystemSettingsPanel />);

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
    });

    it("il pulsante aggiorna ricarica lo stato", async () => {
        renderWithProviders(<SystemSettingsPanel />);
        await screen.findByText(diskLabel);
        expect(api.getSystemStatus).toHaveBeenCalledTimes(1);

        await userEvent.click(screen.getByRole("button", { name: "Aggiorna stato del sistema" }));

        await waitFor(() => expect(api.getSystemStatus).toHaveBeenCalledTimes(2));
    });
});
