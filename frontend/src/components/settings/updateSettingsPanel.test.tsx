import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getUpdateStatus: vi.fn(),
    checkForUpdates: vi.fn(),
    runUpdateNow: vi.fn(),
    getBackupSettings: vi.fn(),
    getUpdateInfo: vi.fn(),
    scheduleUpdate: vi.fn(),
    cancelScheduledUpdate: vi.fn(),
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
import { formatDateISO } from "@/lib/utils";

const status = {
    state: "idle",
    phase: null,
    currentCommit: "abc1234",
    currentVersion: "v1.0.0",
    remoteCommit: "def5678",
    remoteVersion: "v1.1.0",
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

        expect(screen.getByText("v1.0.0")).toBeInTheDocument();
        expect(screen.getByText("Sì (v1.1.0)")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Aggiorna adesso" })).toBeEnabled();
    });

    /** Un server non ancora passato ai tag (o con lo stato scritto dagli script vecchi): si vedono i commit. */
    it("senza versioni di rilascio mostra i commit", async () => {
        api.getUpdateStatus.mockResolvedValue({ ...status, currentVersion: null, remoteVersion: null });
        await renderPanel();

        expect(screen.getByText("abc1234")).toBeInTheDocument();
        expect(screen.getByText("Sì (def5678)")).toBeInTheDocument();
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

        expect(toast.warning).toHaveBeenCalledWith("È disponibile un aggiornamento", { id: "toast-id" });
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

describe("UpdateSettingsPanel: aggiornamento programmato", () => {
    const emptySchedule = {
        scheduledAt: null,
        scheduledBy: null,
        lastOutcome: null,
        lastOutcomeAt: null,
        lastOutcomeMessage: null,
    };

    /** Un'ora di domani, nel fuso del browser: i controlli del dialogo ragionano in ora locale. */
    const inDays = (days: number, hours: number, minutes = 0) => {
        const moment = new Date();
        moment.setDate(moment.getDate() + days);
        moment.setHours(hours, minutes, 0, 0);
        return moment;
    };

    const scheduledStatus = (scheduledAt: Date, overrides: Record<string, unknown> = {}) => ({
        ...status,
        schedule: { ...emptySchedule, scheduledAt: scheduledAt.toISOString(), scheduledBy: "ivan", ...overrides },
    });

    beforeEach(() => {
        api.getUpdateStatus.mockResolvedValue({ ...status, schedule: emptySchedule });
    });

    it("offre Programma solo se c'e' un aggiornamento disponibile", async () => {
        await renderPanel();
        expect(screen.getByRole("button", { name: "Programma" })).toBeEnabled();

        cleanup();
        api.getUpdateStatus.mockResolvedValue({ ...status, updateAvailable: false, schedule: emptySchedule });
        await renderPanel();

        expect(screen.queryByRole("button", { name: "Programma" })).not.toBeInTheDocument();
    });

    it("programma l'aggiornamento proponendo le 03:00 e mostra il riquadro", async () => {
        const target = inDays(1, 3);
        api.scheduleUpdate.mockResolvedValue({
            ...emptySchedule,
            scheduledAt: target.toISOString(),
            scheduledBy: "ivan",
        });
        await renderPanel();

        await click(screen.getByRole("button", { name: "Programma" }));
        const dialog = screen.getByRole("dialog", { name: "Programma aggiornamento" });
        await click(within(dialog).getByRole("button", { name: "Programma" }));

        expect(api.scheduleUpdate).toHaveBeenCalledWith({
            date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            time: "03:00",
        });
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Aggiornamento programmato per"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByText(/^Aggiornamento programmato per .* alle 03:00$/)).toBeInTheDocument();
        expect(screen.getByText(/Programmato da ivan/)).toBeInTheDocument();
    });

    it("modifica: riapre il dialogo con l'orario gia' scelto", async () => {
        const current = inDays(3, 4, 30);
        api.getUpdateStatus.mockResolvedValue(scheduledStatus(current));
        api.scheduleUpdate.mockResolvedValue({ ...emptySchedule, scheduledAt: current.toISOString() });
        await renderPanel();

        await click(screen.getByRole("button", { name: "Modifica" }));
        const dialog = screen.getByRole("dialog", { name: "Modifica aggiornamento programmato" });
        await click(within(dialog).getByRole("button", { name: "Programma" }));

        expect(api.scheduleUpdate).toHaveBeenCalledWith({ date: formatDateISO(current), time: "04:30" });
    });

    it("rifiuta un orario passato senza chiamare il server", async () => {
        api.getUpdateStatus.mockResolvedValue(scheduledStatus(inDays(-1, 3)));
        await renderPanel();

        await click(screen.getByRole("button", { name: "Modifica" }));
        await click(within(screen.getByRole("dialog")).getByRole("button", { name: "Programma" }));

        expect(api.scheduleUpdate).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent("Scegli un orario futuro");
    });

    it("mostra nel dialogo il rifiuto del server e lo lascia aperto", async () => {
        api.scheduleUpdate.mockRejectedValue(new Error("Quell'ora non esiste (cambio dell'ora legale)"));
        await renderPanel();

        await click(screen.getByRole("button", { name: "Programma" }));
        await click(within(screen.getByRole("dialog")).getByRole("button", { name: "Programma" }));

        const dialog = screen.getByRole("dialog", { name: "Programma aggiornamento" });
        expect(within(dialog).getByText(/cambio dell'ora legale/)).toBeInTheDocument();
        expect(screen.queryByText(/^Aggiornamento programmato per/)).not.toBeInTheDocument();
    });

    it("annulla la programmazione solo dopo la conferma", async () => {
        api.getUpdateStatus.mockResolvedValue(scheduledStatus(inDays(1, 3)));
        api.cancelScheduledUpdate.mockResolvedValue(emptySchedule);
        await renderPanel();

        await click(screen.getByRole("button", { name: "Annulla programmazione" }));
        expect(api.cancelScheduledUpdate).not.toHaveBeenCalled();

        const dialog = screen.getByRole("dialog", { name: "Annulla programmazione" });
        await click(within(dialog).getByRole("button", { name: "Annulla programmazione" }));

        expect(api.cancelScheduledUpdate).toHaveBeenCalledOnce();
        expect(toast.success).toHaveBeenCalledWith("Programmazione annullata");
        expect(screen.queryByText(/^Aggiornamento programmato per/)).not.toBeInTheDocument();
    });

    it("se l'annullo fallisce lo dice e tiene la programmazione", async () => {
        api.getUpdateStatus.mockResolvedValue(scheduledStatus(inDays(1, 3)));
        api.cancelScheduledUpdate.mockRejectedValue(new Error("Server non raggiungibile"));
        await renderPanel();

        await click(screen.getByRole("button", { name: "Annulla programmazione" }));
        await click(
            within(screen.getByRole("dialog", { name: "Annulla programmazione" })).getByRole("button", {
                name: "Annulla programmazione",
            })
        );

        expect(toast.error).toHaveBeenCalledWith("Server non raggiungibile");
        expect(screen.getByText(/^Aggiornamento programmato per/)).toBeInTheDocument();
    });

    it("avvisa nella conferma di 'Aggiorna adesso' che la programmazione verra' annullata", async () => {
        api.getUpdateStatus.mockResolvedValue(scheduledStatus(inDays(1, 3)));
        await renderPanel();

        await click(screen.getByRole("button", { name: "Aggiorna adesso" }));

        expect(screen.getByRole("dialog", { name: "Aggiorna applicazione" })).toHaveTextContent(
            /programmato per .* verrà annullato/
        );
    });

    it("mostra l'esito dell'ultimo aggiornamento programmato", async () => {
        api.getUpdateStatus.mockResolvedValue({
            ...status,
            schedule: {
                ...emptySchedule,
                lastOutcome: "cancelled",
                lastOutcomeAt: "2026-09-11T09:00:00.000Z",
                lastOutcomeMessage: "Annullato: il server non era attivo all'ora fissata",
            },
        });
        await renderPanel();

        expect(screen.getByText(/Ultimo aggiornamento programmato annullato il/)).toBeInTheDocument();
        expect(screen.getByText(/il server non era attivo all'ora fissata/)).toBeInTheDocument();
    });

    it("a chi non e' amministratore mostra l'orario ma nessun comando", async () => {
        api.getUpdateInfo.mockResolvedValue({ ...status, scheduledAt: inDays(1, 3).toISOString() });
        renderWithProviders(<UpdateSettingsPanel readOnly />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByText(/^Aggiornamento programmato per .* alle 03:00$/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Programma" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Annulla programmazione" })).not.toBeInTheDocument();
        expect(screen.queryByText(/Programmato da/)).not.toBeInTheDocument();
    });
});
