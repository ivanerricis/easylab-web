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

const toast = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "toast-id"),
}));

vi.mock("sonner", () => ({ toast }));

import UpdateSettingsPanel from "./updateSettingsPanel";
import { renderWithProviders } from "@/test/render";

const status = {
    state: "idle",
    phase: null,
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
        expect(toast.loading).toHaveBeenCalledWith("Verifica aggiornamenti in corso...");

        // Primo giro: la data non è ancora cambiata.
        await nextPoll();
        expect(toast.warning).not.toHaveBeenCalled();

        api.getUpdateStatus.mockResolvedValue({ ...status, lastCheckedAt: "2026-09-11T10:00:00.000Z" });
        await nextPoll();

        expect(toast.warning).toHaveBeenCalledWith("È disponibile un aggiornamento", {
            id: "toast-id",
            richColors: true,
        });
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

        api.getUpdateStatus.mockResolvedValue({
            ...status,
            state: "success",
            currentCommit: "def5678",
            lastUpdateAt: "2026-09-11T09:00:00.000Z",
        });
        await nextPoll();
        expect(toast.success).toHaveBeenCalledWith("Aggiornamento completato. Ricarico la pagina...");

        await nextPoll(1500);
        expect(reload).toHaveBeenCalled();
    });

    /**
     * Bug osservato in produzione: a operazione riuscita l'overlay restava visibile (a posta,
     * per mostrare le spunte) mentre il vero `window.location.reload()` partiva ancora a
     * `busy` non nullo — il `beforeunload` di BusyGuardProvider lo intercettava, e il browser
     * mostrava la sua conferma nativa "Ricaricare l'app?" invece di ricaricare da solo.
     *
     * Un browser vero ferma l'esecuzione dello script proprio dentro `location.reload()`
     * finché quella conferma non riceve una risposta: qui non possiamo riprodurre quel blocco
     * sincrono, ma possiamo controllare la stessa condizione — se il `beforeunload` sarebbe
     * stato impedito — facendo scattare l'evento reale nell'istante esatto in cui il mock di
     * `reload` viene chiamato, invece che dopo che tutto (compreso il `finally`) è già finito.
     */
    it("non lascia il beforeunload bloccare il reload automatico a fine aggiornamento", async () => {
        api.runUpdateNow.mockResolvedValue(status);
        await renderPanel();

        await click(screen.getByRole("button", { name: "Aggiorna adesso" }));
        await click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aggiorna adesso" }));

        const dispatchBeforeUnload = () => {
            const event = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(event);
            return event;
        };

        // Durante l'attesa resta bloccato di proposito: un ricaricamento manuale in questa
        // finestra interromperebbe l'aggiornamento.
        expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

        let wasBlockedWhenReloadFired: boolean | null = null;
        reload.mockImplementation(() => {
            wasBlockedWhenReloadFired = dispatchBeforeUnload().defaultPrevented;
        });

        api.getUpdateStatus.mockResolvedValue({
            ...status,
            state: "success",
            currentCommit: "def5678",
            lastUpdateAt: "2026-09-11T09:00:00.000Z",
        });
        await nextPoll();

        // Durante il conto alla rovescia le spunte restano a schermo, ma è ancora bloccato.
        expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

        await nextPoll(1500);
        expect(reload).toHaveBeenCalled();
        expect(wasBlockedWhenReloadFired).toBe(false);
    });

    /**
     * Bug osservato: quando non c'è niente di nuovo da scaricare (si rilancia l'aggiornamento
     * sulla stessa versione), git reset --hard non cambia currentCommit — e lo spinner restava
     * acceso fino al timeout di 6 minuti perché il pannello riconosceva la fine solo da quel
     * confronto. La fine dell'aggiornamento si vede da lastUpdateAt, non dal commit.
     */
    it("ricarica anche quando l'aggiornamento non cambia il commit", async () => {
        api.runUpdateNow.mockResolvedValue(status);
        await renderPanel();

        await click(screen.getByRole("button", { name: "Aggiorna adesso" }));
        await click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aggiorna adesso" }));

        api.getUpdateStatus.mockResolvedValue({
            ...status,
            state: "success",
            currentCommit: status.currentCommit,
            lastUpdateAt: "2026-09-11T09:00:00.000Z",
        });
        await nextPoll();
        expect(toast.success).toHaveBeenCalledWith("Aggiornamento completato. Ricarico la pagina...");

        await nextPoll(1500);
        expect(reload).toHaveBeenCalled();
    });

    /**
     * scripts/update-server.sh scrive la fase corrente in status.json mentre l'aggiornamento
     * gira: qui verifichiamo che il pannello segua quella fase invece di mostrare solo uno
     * spinner muto per i minuti in cui l'utente aspetta.
     */
    it("segue le fasi dell'aggiornamento durante l'attesa", async () => {
        api.runUpdateNow.mockResolvedValue(status);
        await renderPanel();

        await click(screen.getByRole("button", { name: "Aggiorna adesso" }));
        await click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aggiorna adesso" }));

        const overlay = screen.getByRole("alert");
        expect(within(overlay).getByText("Verifica della firma del commit").closest("li")).toHaveAttribute(
            "aria-current",
            "step"
        );

        api.getUpdateStatus.mockResolvedValue({ ...status, state: "running", phase: "build" });
        await nextPoll();

        expect(within(overlay).getByText("Ricostruzione dei container").closest("li")).toHaveAttribute(
            "aria-current",
            "step"
        );
        expect(within(overlay).getByText("Aggiornamento del codice").closest("li")).not.toHaveAttribute("aria-current");

        api.getUpdateStatus.mockResolvedValue({
            ...status,
            state: "success",
            currentCommit: "def5678",
            lastUpdateAt: "2026-09-11T09:00:00.000Z",
        });
        await nextPoll();

        // Bug osservato: a operazione riuscita l'ultima fase restava segnata come "ancora in
        // corso" durante l'attesa prima del reload, invece di spuntarsi come le altre.
        expect(within(overlay).getByText("Pulizia delle immagini vecchie").closest("li")).toHaveAttribute(
            "data-status",
            "done"
        );
        expect(overlay.querySelector('[aria-current="step"]')).not.toBeInTheDocument();

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
            lastUpdateAt: "2026-09-11T09:00:00.000Z",
        });
        await nextPoll();

        expect(toast.error).toHaveBeenCalledWith("docker compose build fallito");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(reload).not.toHaveBeenCalled();
    });
});
