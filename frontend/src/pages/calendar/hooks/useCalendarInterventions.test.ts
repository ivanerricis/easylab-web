import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listInterventions = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return { ...errors, listInterventions: (...args: unknown[]) => listInterventions(...args) };
});

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        warning: (...args: unknown[]) => toastWarning(...args),
    },
}));

import { useCalendarInterventions, type CalendarRange } from "./useCalendarInterventions";
import type { InterventionDto } from "@/types/dtos";

const buildIntervention = (overrides: Partial<InterventionDto>): InterventionDto => ({
    id: 1,
    type: "intervento_sede",
    description: null,
    status: "programmato",
    interventionDate: "2026-09-11",
    startTime: "09:00:00",
    endTime: "10:30:00",
    customerId: 1,
    collaboratorId: 1,
    customer: "Mario Rossi",
    customerPhone: null,
    collaborator: "Luca",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: null,
    ...overrides,
});

const page = (items: InterventionDto[], totalItems = items.length) => ({
    items,
    totalItems,
    page: 1,
    pageSize: 1000,
    totalPages: 1,
});

const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

const september: CalendarRange = { from: "2026-08-31", to: "2026-10-04" };

beforeEach(() => {
    vi.clearAllMocks();
});

describe("useCalendarInterventions", () => {
    it("non carica nulla finché il calendario non comunica l'intervallo", () => {
        renderHook(() => useCalendarInterventions(null));

        expect(listInterventions).not.toHaveBeenCalled();
    });

    it("chiede solo gli interventi del periodo visibile", async () => {
        listInterventions.mockResolvedValue(page([]));

        renderHook(() => useCalendarInterventions(september));

        await waitFor(() => {
            expect(listInterventions).toHaveBeenCalledWith({
                scheduledFrom: "2026-08-31",
                scheduledTo: "2026-10-04",
                pageSize: 1000,
                signal: expect.any(AbortSignal),
            });
        });
    });

    it("trasforma un intervento con orario in un evento a orario", async () => {
        listInterventions.mockResolvedValue(page([buildIntervention({})]));

        const { result } = renderHook(() => useCalendarInterventions(september));

        await waitFor(() => {
            expect(result.current.events).toHaveLength(1);
        });

        const [event] = result.current.events;
        expect(event.title).toBe("Mario Rossi · Intervento in sede");
        expect(event.start).toEqual(new Date(2026, 8, 11, 9, 0));
        expect(event.end).toEqual(new Date(2026, 8, 11, 10, 30));
        expect(event.allDay).toBeUndefined();
    });

    it("mette a giornata intera le consegne senza orario e i record senza data", async () => {
        listInterventions.mockResolvedValue(
            page([
                buildIntervention({ id: 1, type: "consegna_materiale", startTime: null, endTime: null }),
                buildIntervention({ id: 2, interventionDate: null, startTime: null, endTime: null }),
            ])
        );

        const { result } = renderHook(() => useCalendarInterventions(september));

        await waitFor(() => {
            expect(result.current.events).toHaveLength(2);
        });

        const [delivery, legacy] = result.current.events;
        expect(delivery.allDay).toBe(true);
        expect(delivery.start).toEqual(new Date(2026, 8, 11));
        // Ripiego sulla data di creazione per i record nati prima del campo data.
        expect(legacy.allDay).toBe(true);
        expect(legacy.start).toEqual(new Date("2026-09-01T08:00:00.000Z"));
    });

    /** Un calendario che tace e ne mostra solo una parte è il difetto che l'hook ha corretto. */
    it("avvisa quando il periodo contiene più interventi di quelli disegnati", async () => {
        listInterventions.mockResolvedValue(page([buildIntervention({})], 1200));

        renderHook(() => useCalendarInterventions(september));

        await waitFor(() => {
            expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining("ci sono 1200 interventi"));
        });
    });

    it("segnala l'errore di caricamento", async () => {
        listInterventions.mockRejectedValue(new Error("rete non raggiungibile"));

        const { result } = renderHook(() => useCalendarInterventions(september));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("rete non raggiungibile");
        });
        expect(result.current.isLoading).toBe(false);
    });

    it("scarta e annulla la richiesta del mese superato", async () => {
        const signals: AbortSignal[] = [];
        const first = createDeferred<ReturnType<typeof page>>();
        const second = createDeferred<ReturnType<typeof page>>();
        listInterventions.mockImplementation(({ signal }: { signal: AbortSignal }) => {
            signals.push(signal);
            return signals.length === 1 ? first.promise : second.promise;
        });

        const { result, rerender } = renderHook(({ range }) => useCalendarInterventions(range), {
            initialProps: { range: september },
        });
        await waitFor(() => {
            expect(signals).toHaveLength(1);
        });

        rerender({ range: { from: "2026-09-28", to: "2026-11-08" } });
        await waitFor(() => {
            expect(signals).toHaveLength(2);
        });
        expect(signals[0].aborted).toBe(true);

        await act(async () => {
            second.resolve(page([buildIntervention({ id: 2, customer: "Ottobre" })]));
            first.resolve(page([buildIntervention({ id: 1, customer: "Settembre" })]));
            await Promise.all([first.promise, second.promise]);
        });

        expect(result.current.events.map((event) => event.resource.customer)).toEqual(["Ottobre"]);
    });

    it("mostra il velo solo al primo caricamento", async () => {
        const next = createDeferred<ReturnType<typeof page>>();
        listInterventions.mockResolvedValueOnce(page([])).mockReturnValueOnce(next.promise);

        const { result } = renderHook(() => useCalendarInterventions(september));
        expect(result.current.isInitialLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        act(() => {
            void result.current.loadEvents();
        });

        expect(result.current.isLoading).toBe(true);
        expect(result.current.isInitialLoading).toBe(false);

        await act(async () => {
            next.resolve(page([]));
            await next.promise;
        });
    });
});
