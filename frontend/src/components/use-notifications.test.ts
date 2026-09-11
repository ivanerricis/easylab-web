import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Le sorgenti reali chiamano l'API: qui il hook riceve sempre sorgenti finte, ma il modulo
// viene comunque importato per il valore di default del parametro.
vi.mock("@/lib/api", () => ({}));

import type { AppNotification, NotificationSource } from "@/lib/notifications";
import { useNotifications } from "./use-notifications";

const storageKey = "notifications-dismissed";

const reminder = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
    id,
    title: `Voce ${id}`,
    ...overrides,
});

const buildSource = (key: string, load: () => Promise<AppNotification[]>, extra: Partial<NotificationSource> = {}) => ({
    key,
    label: key,
    load: vi.fn(load),
    ...extra,
});

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useNotifications", () => {
    it("carica ogni sorgente e conta solo le voci non risolte", async () => {
        const sources = [
            buildSource("a", async () => [reminder("1"), reminder("2", { resolved: true })]),
            buildSource("b", async () => [reminder("3")]),
        ];

        const { result } = renderHook(() => useNotifications(sources));

        await waitFor(() => {
            expect(result.current.sections).toHaveLength(2);
        });
        expect(result.current.badgeCount).toBe(2);
    });

    it("nasconde le sezioni vuote a meno che abbiano un testo per il vuoto", async () => {
        const sources = [
            buildSource("vuota", async () => []),
            buildSource("con-testo", async () => [], { emptyLabel: "Niente per oggi." }),
        ];

        const { result } = renderHook(() => useNotifications(sources));

        await waitFor(() => {
            expect(sources[1].load).toHaveBeenCalled();
        });
        expect(result.current.sections.map((section) => section.source.key)).toEqual(["con-testo"]);
    });

    it("una sorgente che fallisce non impedisce di mostrare le altre", async () => {
        const sources = [
            buildSource("rotta", async () => {
                throw new Error("rete");
            }),
            buildSource("ok", async () => [reminder("1")]),
        ];

        const { result } = renderHook(() => useNotifications(sources));

        await waitFor(() => {
            expect(result.current.badgeCount).toBe(1);
        });
    });

    it("ricorda nel browser le voci chiuse delle sorgenti senza chiusura propria", async () => {
        const sources = [buildSource("a", async () => [reminder("1"), reminder("2")])];

        const { result } = renderHook(() => useNotifications(sources));
        await waitFor(() => {
            expect(result.current.badgeCount).toBe(2);
        });

        act(() => {
            result.current.dismiss("a", "1");
        });

        expect(result.current.sections[0].notifications.map((notification) => notification.id)).toEqual(["2"]);
        expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual({ a: ["1"] });

        // Un nuovo montaggio (una nuova scheda) non la rimostra.
        const { result: reopened } = renderHook(() => useNotifications(sources));
        await waitFor(() => {
            expect(reopened.current.badgeCount).toBe(1);
        });
    });

    it("delega la chiusura alla sorgente che la gestisce, senza toccare il browser", async () => {
        const dismiss = vi.fn().mockResolvedValue(undefined);
        const sources = [buildSource("server", async () => [reminder("1"), reminder("2")], { dismiss })];

        const { result } = renderHook(() => useNotifications(sources));
        await waitFor(() => {
            expect(result.current.badgeCount).toBe(2);
        });

        act(() => {
            result.current.dismiss("server", "1");
        });

        expect(dismiss).toHaveBeenCalledWith("1");
        expect(result.current.badgeCount).toBe(1);
        expect(localStorage.getItem(storageKey)).toBeNull();
    });

    /** Senza, l'elenco delle voci chiuse crescerebbe per sempre, un id al giorno. */
    it("dimentica le voci chiuse che la sorgente non restituisce più", async () => {
        localStorage.setItem(storageKey, JSON.stringify({ a: ["vecchia", "1"], b: ["x"] }));
        const sources = [buildSource("a", async () => [reminder("1"), reminder("2")])];

        const { result } = renderHook(() => useNotifications(sources));

        await waitFor(() => {
            expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual({ a: ["1"], b: ["x"] });
        });
        expect(result.current.badgeCount).toBe(1);
    });

    it("non dimentica le voci chiuse di una sorgente che non ha risposto", async () => {
        localStorage.setItem(storageKey, JSON.stringify({ a: ["1"] }));
        const sources = [
            buildSource("a", async () => {
                throw new Error("rete");
            }),
        ];

        renderHook(() => useNotifications(sources));

        await waitFor(() => {
            expect(sources[0].load).toHaveBeenCalled();
        });
        expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual({ a: ["1"] });
    });

    it("ricarica ogni cinque minuti", async () => {
        vi.useFakeTimers();
        const sources = [buildSource("a", async () => [])];

        renderHook(() => useNotifications(sources));
        expect(sources[0].load).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        });

        expect(sources[0].load).toHaveBeenCalledTimes(2);
    });

    it("sopravvive a un valore illeggibile nel localStorage", async () => {
        localStorage.setItem(storageKey, "{non json");
        const sources = [buildSource("a", async () => [reminder("1")])];

        const { result } = renderHook(() => useNotifications(sources));

        await waitFor(() => {
            expect(result.current.badgeCount).toBe(1);
        });
    });
});
