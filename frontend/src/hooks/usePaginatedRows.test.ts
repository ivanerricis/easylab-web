import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedRows } from "./usePaginatedRows";
import type { PaginatedResponse } from "@/lib/api/client";

const toastError = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
    },
}));

type Row = { id: number; name: string };

const buildResponse = (items: Row[]): PaginatedResponse<Row> => ({
    items,
    totalItems: items.length,
    page: 1,
    pageSize: 10,
    totalPages: 1,
});

/** Promise che il test risolve quando vuole, per controllare l'ordine di arrivo. */
const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
};

beforeEach(() => {
    toastError.mockClear();
});

describe("usePaginatedRows", () => {
    it("carica le righe al montaggio ed espone i totali della risposta", async () => {
        const fetchRows = vi.fn().mockResolvedValue({
            items: [{ id: 1, name: "Mario" }],
            totalItems: 42,
            page: 1,
            pageSize: 10,
            totalPages: 5,
        });

        const { result } = renderHook(() =>
            usePaginatedRows<Row>({
                fetchRows,
                queryKey: [1],
                errorMessage: "Errore",
            })
        );

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.rows).toEqual([{ id: 1, name: "Mario" }]);
        expect(result.current.totalItems).toBe(42);
        expect(result.current.totalPages).toBe(5);
    });

    /**
     * È la ragione per cui questo hook esiste: digitando in fretta nella ricerca partono
     * più richieste e le risposte possono tornare in ordine diverso da quello di
     * partenza. Senza la guardia sull'id, la risposta vecchia che arriva per ultima
     * sovrascrive la tabella con dati non più corrispondenti a ciò che è scritto nel
     * campo di ricerca.
     */
    it("scarta la risposta di una richiesta superata da una più recente", async () => {
        const first = createDeferred<PaginatedResponse<Row>>();
        const second = createDeferred<PaginatedResponse<Row>>();
        const fetchRows = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const { result } = renderHook(() =>
            usePaginatedRows<Row>({
                fetchRows,
                queryKey: [],
                errorMessage: "Errore",
            })
        );

        // Seconda richiesta partita mentre la prima è ancora in volo.
        await act(async () => {
            void result.current.reload();
        });

        expect(fetchRows).toHaveBeenCalledTimes(2);

        // La più recente risponde per prima...
        await act(async () => {
            second.resolve(buildResponse([{ id: 2, name: "Recente" }]));
            await second.promise;
        });

        // ...e la vecchia arriva dopo: non deve avere effetto.
        await act(async () => {
            first.resolve(buildResponse([{ id: 1, name: "Obsoleto" }]));
            await first.promise;
        });

        expect(result.current.rows).toEqual([{ id: 2, name: "Recente" }]);
        expect(result.current.isLoading).toBe(false);
    });

    it("non mostra l'errore di una richiesta già superata", async () => {
        const first = createDeferred<PaginatedResponse<Row>>();
        const second = createDeferred<PaginatedResponse<Row>>();
        const fetchRows = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const { result } = renderHook(() =>
            usePaginatedRows<Row>({
                fetchRows,
                queryKey: [],
                errorMessage: "Caricamento non riuscito",
            })
        );

        await act(async () => {
            void result.current.reload();
        });

        await act(async () => {
            second.resolve(buildResponse([{ id: 2, name: "Recente" }]));
            await second.promise;
        });

        await act(async () => {
            first.reject(new Error("boom"));
            await first.promise.catch(() => undefined);
        });

        expect(toastError).not.toHaveBeenCalled();
        expect(result.current.rows).toEqual([{ id: 2, name: "Recente" }]);
    });

    it("segnala l'errore della richiesta corrente", async () => {
        const fetchRows = vi.fn().mockRejectedValue(new Error("rete non raggiungibile"));

        const { result } = renderHook(() =>
            usePaginatedRows<Row>({
                fetchRows,
                queryKey: [],
                errorMessage: "Caricamento non riuscito",
            })
        );

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("rete non raggiungibile");
        });

        expect(result.current.rows).toEqual([]);
        expect(result.current.isLoading).toBe(false);
    });

    it("ricarica quando cambia la queryKey", async () => {
        const fetchRows = vi.fn().mockResolvedValue(buildResponse([{ id: 1, name: "A" }]));

        const { rerender } = renderHook(
            ({ search }: { search: string }) =>
                usePaginatedRows<Row>({
                    fetchRows,
                    queryKey: [search],
                    errorMessage: "Errore",
                }),
            { initialProps: { search: "mar" } }
        );

        await waitFor(() => {
            expect(fetchRows).toHaveBeenCalledTimes(1);
        });

        rerender({ search: "mario" });

        await waitFor(() => {
            expect(fetchRows).toHaveBeenCalledTimes(2);
        });

        // Stessa chiave: nessuna richiesta aggiuntiva.
        rerender({ search: "mario" });
        expect(fetchRows).toHaveBeenCalledTimes(2);
    });

    /**
     * La guardia sull'id basta alla correttezza, ma lascia il server a macinare richieste
     * che nessuno leggerà. Qui si verifica che la richiesta superata venga annullata per
     * davvero, cioè che il suo signal risulti abortito.
     */
    it("annulla la richiesta superata da una più recente", async () => {
        const signals: AbortSignal[] = [];
        const first = createDeferred<PaginatedResponse<Row>>();
        const second = createDeferred<PaginatedResponse<Row>>();
        const fetchRows = vi.fn().mockImplementation((signal: AbortSignal) => {
            signals.push(signal);
            return signals.length === 1 ? first.promise : second.promise;
        });

        const { result } = renderHook(() =>
            usePaginatedRows<Row>({
                fetchRows,
                queryKey: [],
                errorMessage: "Errore",
            })
        );

        await act(async () => {
            void result.current.reload();
        });

        expect(signals).toHaveLength(2);
        expect(signals[0].aborted).toBe(true);
        expect(signals[1].aborted).toBe(false);

        await act(async () => {
            second.resolve(buildResponse([{ id: 2, name: "Recente" }]));
            await second.promise;
        });

        expect(result.current.rows).toEqual([{ id: 2, name: "Recente" }]);
    });

    /**
     * Cambiare pagina mentre una lista sta caricando annulla la richiesta in volo, che *è*
     * ancora la più recente: senza il controllo su `signal.aborted` l'annullamento sarebbe
     * scambiato per un errore di rete e comparirebbe un avviso rosso a schermo.
     */
    it("non segnala come errore la richiesta annullata allo smontaggio", async () => {
        const signals: AbortSignal[] = [];
        const pending = createDeferred<PaginatedResponse<Row>>();
        const fetchRows = vi.fn().mockImplementation((signal: AbortSignal) => {
            signals.push(signal);
            return pending.promise;
        });

        const { unmount } = renderHook(() =>
            usePaginatedRows<Row>({
                fetchRows,
                queryKey: [],
                errorMessage: "Caricamento non riuscito",
            })
        );

        await waitFor(() => {
            expect(fetchRows).toHaveBeenCalledTimes(1);
        });

        unmount();

        expect(signals[0].aborted).toBe(true);

        await act(async () => {
            pending.reject(new Error("richiesta annullata"));
            await pending.promise.catch(() => undefined);
        });

        expect(toastError).not.toHaveBeenCalled();
    });

    it("updateRow modifica solo le righe che corrispondono", async () => {
        const fetchRows = vi.fn().mockResolvedValue(
            buildResponse([
                { id: 1, name: "A" },
                { id: 2, name: "B" },
            ])
        );

        const { result } = renderHook(() =>
            usePaginatedRows<Row>({
                fetchRows,
                queryKey: [],
                errorMessage: "Errore",
            })
        );

        await waitFor(() => {
            expect(result.current.rows).toHaveLength(2);
        });

        act(() => {
            result.current.updateRow(
                (row) => row.id === 2,
                (row) => ({ ...row, name: "B modificata" })
            );
        });

        expect(result.current.rows).toEqual([
            { id: 1, name: "A" },
            { id: 2, name: "B modificata" },
        ]);
    });
});
