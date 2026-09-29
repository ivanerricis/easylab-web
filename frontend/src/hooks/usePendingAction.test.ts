import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => toastSuccess(...args),
        error: (...args: unknown[]) => toastError(...args),
    },
}));

import { usePendingAction } from "./usePendingAction";

type Row = { id: number; name: string };

const row: Row = { id: 7, name: "Mario" };

/**
 * Un rifiuto senza testo proprio: `getApiErrorMessage` ripiega sul messaggio passato al hook (un
 * `Error` porterebbe il suo, come una risposta del server con `message`).
 */
const rejection = { reason: "rifiutato" };

/** Una promessa da risolvere a mano, per guardare lo stato a metà dell'azione. */
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("usePendingAction", () => {
    it("apre e chiude sull'elemento scelto", () => {
        const { result } = renderHook(() =>
            usePendingAction<Row>({ run: vi.fn(async () => {}), errorMessage: "Errore" })
        );

        expect(result.current.isOpen).toBe(false);
        expect(result.current.pending).toBeNull();

        act(() => result.current.open(row));
        expect(result.current.isOpen).toBe(true);
        expect(result.current.pending).toBe(row);

        // `onOpenChange(true)` non fa niente: il dialogo si apre solo con `open`.
        act(() => result.current.onOpenChange(true));
        expect(result.current.pending).toBe(row);

        act(() => result.current.onOpenChange(false));
        expect(result.current.isOpen).toBe(false);
        expect(result.current.pending).toBeNull();

        act(() => result.current.open(row));
        act(() => result.current.close());
        expect(result.current.isOpen).toBe(false);
    });

    it("esegue sull'elemento, avvisa, chiude e poi chiama onDone con elemento e risposta", async () => {
        const calls: string[] = [];
        const run = vi.fn(async (item: Row) => {
            calls.push("run");
            return { message: `inviata a ${item.name}` };
        });
        toastSuccess.mockImplementation(() => calls.push("toast"));
        const onDone = vi.fn(() => {
            calls.push("done");
        });
        const { result } = renderHook(() =>
            usePendingAction<Row, { message: string }>({
                run,
                successMessage: (item: Row, response: { message: string }) => `${item.id}: ${response.message}`,
                errorMessage: "Errore",
                onDone,
            })
        );

        act(() => result.current.open(row));
        await act(() => result.current.confirm());

        expect(run).toHaveBeenCalledWith(row);
        expect(toastSuccess).toHaveBeenCalledWith("7: inviata a Mario");
        expect(onDone).toHaveBeenCalledWith(row, { message: "inviata a Mario" });
        expect(calls).toEqual(["run", "toast", "done"]);
        expect(toastError).not.toHaveBeenCalled();
        expect(result.current.isOpen).toBe(false);
        expect(result.current.isRunning).toBe(false);
    });

    it("accetta un avviso fisso, e senza avviso non ne mostra nessuno", async () => {
        const { result: withMessage } = renderHook(() =>
            usePendingAction<Row>({ run: async () => {}, successMessage: "Eliminato", errorMessage: "Errore" })
        );
        act(() => withMessage.current.open(row));
        await act(() => withMessage.current.confirm());
        expect(toastSuccess).toHaveBeenCalledWith("Eliminato");

        toastSuccess.mockClear();
        const { result: silent } = renderHook(() =>
            usePendingAction<Row>({ run: async () => {}, errorMessage: "Errore" })
        );
        act(() => silent.current.open(row));
        await act(() => silent.current.confirm());
        expect(toastSuccess).not.toHaveBeenCalled();
        expect(silent.current.isOpen).toBe(false);
    });

    it("resta occupato fino alla fine di onDone, che è compreso nell'azione", async () => {
        const reload = deferred<void>();
        const { result } = renderHook(() =>
            usePendingAction<Row>({ run: async () => {}, errorMessage: "Errore", onDone: () => reload.promise })
        );

        act(() => result.current.open(row));
        let confirmed!: Promise<void>;
        act(() => {
            confirmed = result.current.confirm();
        });
        await vi.waitFor(() => expect(result.current.isOpen).toBe(false));
        expect(result.current.isRunning).toBe(true);

        await act(async () => {
            reload.resolve();
            await confirmed;
        });
        expect(result.current.isRunning).toBe(false);
    });

    it("in caso di errore avvisa con il testo di ripiego e lascia il dialogo aperto", async () => {
        const onDone = vi.fn();
        const { result } = renderHook(() =>
            usePendingAction<Row>({
                run: () => Promise.reject(rejection),
                successMessage: "Eliminato",
                errorMessage: "Impossibile eliminare",
                onDone,
            })
        );

        act(() => result.current.open(row));
        await act(() => result.current.confirm());

        expect(toastError).toHaveBeenCalledWith("Impossibile eliminare");
        expect(toastSuccess).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        expect(result.current.pending).toBe(row);
        expect(result.current.isRunning).toBe(false);
    });

    it("un errore di onDone arriva allo stesso avviso d'errore", async () => {
        const { result } = renderHook(() =>
            usePendingAction<Row>({
                run: async () => {},
                errorMessage: "Impossibile eliminare",
                onDone: () => Promise.reject(rejection),
            })
        );

        act(() => result.current.open(row));
        await act(() => result.current.confirm());

        expect(toastError).toHaveBeenCalledWith("Impossibile eliminare");
    });

    it("con onError l'errore va a chi lo chiede, non in un avviso", async () => {
        const onError = vi.fn();
        const { result } = renderHook(() =>
            usePendingAction<Row>({
                run: () => Promise.reject(rejection),
                errorMessage: "Impossibile disattivare",
                onError,
            })
        );

        act(() => result.current.open(row));
        await act(() => result.current.confirm());

        expect(onError).toHaveBeenCalledWith("Impossibile disattivare", rejection, row);
        expect(toastError).not.toHaveBeenCalled();
    });

    it("non parte a dialogo chiuso, né una seconda volta mentre la prima è in corso", async () => {
        const pendingRun = deferred<void>();
        const run = vi.fn(() => pendingRun.promise);
        const { result } = renderHook(() => usePendingAction<Row>({ run, errorMessage: "Errore" }));

        await act(() => result.current.confirm());
        expect(run).not.toHaveBeenCalled();

        act(() => result.current.open(row));
        // Due conferme nello stesso istante, dalla stessa istantanea: lo stato "in corso" non è
        // ancora arrivato al render, ed è il ref a fermare la seconda.
        const { confirm } = result.current;
        let first!: Promise<void>;
        act(() => {
            first = confirm();
            void confirm();
        });
        expect(run).toHaveBeenCalledTimes(1);

        await act(async () => {
            pendingRun.resolve();
            await first;
        });
        expect(result.current.isRunning).toBe(false);

        // Finita la prima, la protezione si toglie: la conferma successiva riparte.
        act(() => result.current.open(row));
        await act(() => result.current.confirm());
        expect(run).toHaveBeenCalledTimes(2);
    });

    it("funziona anche senza elemento (T = void)", async () => {
        const run = vi.fn(async () => {});
        const { result } = renderHook(() => usePendingAction({ run, errorMessage: "Errore" }));

        act(() => result.current.open());
        expect(result.current.isOpen).toBe(true);

        await act(() => result.current.confirm());
        expect(run).toHaveBeenCalledTimes(1);
        expect(result.current.isOpen).toBe(false);
    });
});
