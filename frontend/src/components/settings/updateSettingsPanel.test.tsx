import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getUpdateStatus: vi.fn(),
    checkForUpdates: vi.fn(),
    runUpdateNow: vi.fn(),
    getBackupSettings: vi.fn(),
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

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import UpdateSettingsPanel from "./updateSettingsPanel";
import { renderWithProviders } from "@/test/render";

const status = {
    state: "idle",
    currentCommit: "abc1234",
    remoteCommit: "def5678",
    updateAvailable: true,
    lastCheckedAt: "2026-09-11T08:00:00.000Z",
    lastUpdateAt: null,
    lastUpdateStatus: null,
    lastError: null,
    log: null,
};

const reload = vi.fn();

/** Fa passare un giro di polling (3 secondi) e lascia risolvere le promesse. */
const nextPoll = async (ms = 3000) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
};

const renderPanel = async () => {
    renderWithProviders(<UpdateSettingsPanel />);
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
    api.getUpdateStatus.mockResolvedValue(status);
    api.getBackupSettings.mockResolvedValue({ lastRunAt: "2026-09-10T21:00:00.000Z", lastRunStatus: "success" });
});

afterEach(() => {
    vi.useRealTimers();
});

/**
 * Click e poi un giro di microtask. Niente `userEvent` qui: i suoi ritardi fra un evento e
 * l'altro sono `setTimeout`, e con i timer finti (che servono per il polling ogni 3 secondi)
 * aspetterebbe per sempre.
 */
const click = async (element: HTMLElement) => {
    await act(async () => {
        fireEvent.click(element);
        await vi.advanceTimersByTimeAsync(0);
    });
};

describe("UpdateSettingsPanel", () => {
    it("mostra versione installata e aggiornamento disponibile", async () => {
        await renderPanel();

        expect(screen.getByText("abc1234")).toBeInTheDocument();
        expect(screen.getByText("Sì (def5678)")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Aggiorna adesso" })).toBeEnabled();
    });

    it("senza aggiornamenti non lascia avviare l'aggiornamento", async () => {
        api.getUpdateStatus.mockResolvedValue({ ...status, updateAvailable: false });
        await renderPanel();

        expect(screen.getByRole("button", { name: "Aggiorna adesso" })).toBeDisabled();
    });

    /** La verifica gira sul server: finisce quando cambia la data dell'ultima verifica. */
    it("verifica gli aggiornamenti aspettando la risposta del server", async () => {
        api.checkForUpdates.mockResolvedValue(status);
        await renderPanel();

        await click(screen.getByRole("button", { name: "Verifica aggiornamenti" }));
        expect(screen.getByRole("button", { name: "Verifica in corso..." })).toBeDisabled();

        // Primo giro: la data non è ancora cambiata.
        await nextPoll();
        expect(toast.warning).not.toHaveBeenCalled();

        api.getUpdateStatus.mockResolvedValue({ ...status, lastCheckedAt: "2026-09-11T10:00:00.000Z" });
        await nextPoll();

        expect(toast.warning).toHaveBeenCalledWith("È disponibile un aggiornamento", { richColors: true });
        expect(screen.getByRole("button", { name: "Verifica aggiornamenti" })).toBeEnabled();
    });

    /**
     * Prima di aggiornare si ricorda il backup: l'aggiornamento può migrare il database, e il
     * backup è l'unico modo per tornare indietro.
     */
    it("nella conferma mostra quando è stato fatto l'ultimo backup", async () => {
        await renderPanel();

        await click(screen.getByRole("button", { name: "Aggiorna adesso" }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        const dialog = screen.getByRole("dialog", { name: "Aggiorna applicazione" });
        expect(within(dialog).getByText("Riuscito")).toBeInTheDocument();
        expect(api.getBackupSettings).toHaveBeenCalled();
    });

    it("aggiorna bloccando la pagina, e ricarica quando la versione cambia", async () => {
        api.runUpdateNow.mockResolvedValue(status);
        await renderPanel();

        await click(screen.getByRole("button", { name: "Aggiorna adesso" }));
        await click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aggiorna adesso" }));

        expect(screen.getByRole("alert")).toHaveTextContent("Aggiornamento in corso...");

        // Mentre i container si ricostruiscono il backend non risponde: si ritenta.
        api.getUpdateStatus.mockRejectedValueOnce(new Error("Network Error"));
        await nextPoll();
        expect(reload).not.toHaveBeenCalled();

        api.getUpdateStatus.mockResolvedValue({ ...status, state: "success", currentCommit: "def5678" });
        await nextPoll();
        expect(toast.success).toHaveBeenCalledWith("Aggiornamento completato. Ricarico la pagina...");

        await nextPoll(1500);
        expect(reload).toHaveBeenCalled();
    });

    it("se l'aggiornamento fallisce lo dice e sblocca la pagina", async () => {
        api.runUpdateNow.mockResolvedValue(status);
        await renderPanel();

        await click(screen.getByRole("button", { name: "Aggiorna adesso" }));
        await click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aggiorna adesso" }));

        api.getUpdateStatus.mockResolvedValue({
            ...status,
            state: "failed",
            lastError: "docker compose build fallito",
        });
        await nextPoll();

        expect(toast.error).toHaveBeenCalledWith("docker compose build fallito");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(reload).not.toHaveBeenCalled();
    });
});
