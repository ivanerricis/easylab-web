import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUpdateState = vi.fn();

vi.mock("@/lib/api", () => ({
    getUpdateState: (...args: unknown[]) => getUpdateState(...args),
}));

import { BusyGuardProvider } from "@/components/busy-guard-provider";
import { useUpdateWatcher } from "./useUpdateWatcher";

const Watcher = () => {
    useUpdateWatcher();
    return null;
};

const reload = vi.fn();

/** Fa girare il timer di un giro e lascia risolvere la promessa della richiesta. */
const nextPoll = async () => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
    });
};

const renderWatcher = async () => {
    render(
        <BusyGuardProvider>
            <Watcher />
        </BusyGuardProvider>
    );
    // Il primo giro parte al montaggio, senza aspettare l'intervallo.
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
};

beforeEach(() => {
    vi.useFakeTimers();
    getUpdateState.mockReset();
    reload.mockReset();
    Object.defineProperty(window, "location", {
        value: { ...window.location, reload },
        configurable: true,
        writable: true,
    });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useUpdateWatcher", () => {
    it("non mostra nulla quando nessun aggiornamento è in corso", async () => {
        getUpdateState.mockResolvedValue({ state: "idle" });

        await renderWatcher();
        await nextPoll();

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(reload).not.toHaveBeenCalled();
    });

    it("blocca la scheda durante l'aggiornamento e la ricarica quando riesce", async () => {
        getUpdateState.mockResolvedValue({ state: "running" });

        await renderWatcher();

        expect(screen.getByRole("alert")).toHaveTextContent("Aggiornamento in corso...");

        getUpdateState.mockResolvedValue({ state: "success" });
        await nextPoll();

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    /**
     * Mentre i container si ricostruiscono il backend non risponde: se un errore di rete
     * togliesse il blocco, l'utente tornerebbe a scrivere proprio mentre girano le migrazioni.
     */
    it("tiene il blocco quando il backend non risponde", async () => {
        getUpdateState.mockResolvedValue({ state: "running" });
        await renderWatcher();

        getUpdateState.mockRejectedValue(new Error("Network Error"));
        await nextPoll();
        await nextPoll();

        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(reload).not.toHaveBeenCalled();
    });

    it("toglie il blocco senza ricaricare quando l'aggiornamento fallisce", async () => {
        getUpdateState.mockResolvedValue({ state: "running" });
        await renderWatcher();

        getUpdateState.mockResolvedValue({ state: "failed" });
        await nextPoll();

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(reload).not.toHaveBeenCalled();
    });

    it("non ricarica per un 'success' di un aggiornamento che non ha visto partire", async () => {
        getUpdateState.mockResolvedValue({ state: "success" });

        await renderWatcher();
        await nextPoll();

        expect(reload).not.toHaveBeenCalled();
    });

    it("smette di interrogare allo smontaggio", async () => {
        getUpdateState.mockResolvedValue({ state: "idle" });
        const { unmount } = render(
            <BusyGuardProvider>
                <Watcher />
            </BusyGuardProvider>
        );
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        const callsAtUnmount = getUpdateState.mock.calls.length;

        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(20000);
        });

        expect(getUpdateState).toHaveBeenCalledTimes(callsAtUnmount);
    });
});
