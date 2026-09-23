import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const toastError = vi.fn();

vi.mock("sonner", () => ({
    toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import { useEntityDetail } from "./useEntityDetail";

/** Come arriva da axios una risposta 404: `getApiErrorStatus` guarda solo questi campi. */
const notFoundError = () =>
    Object.assign(new Error("Request failed with status code 404"), {
        isAxiosError: true,
        response: { status: 404, data: { message: "Not found" } },
    });

/** Una promise che il test risolve quando vuole, per controllare l'ordine di arrivo. */
const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("useEntityDetail", () => {
    it("carica l'entità per l'id corrente", async () => {
        const fetcher = vi.fn().mockResolvedValue({ id: 5, name: "Mario" });

        const { result } = renderHook(() =>
            useEntityDetail("5", fetcher, { backTo: "/reports", errorMessage: "Errore" })
        );

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(fetcher).toHaveBeenCalledWith(5);
        expect(result.current.data).toEqual({ id: 5, name: "Mario" });
        expect(result.current.isNotFound).toBe(false);
    });

    it("mostra 'non trovato' con un id non valido, senza chiamare il caricatore", () => {
        const fetcher = vi.fn();

        const { result } = renderHook(() =>
            useEntityDetail("abc", fetcher, { backTo: "/reports", errorMessage: "Errore" })
        );

        expect(result.current.isNotFound).toBe(true);
        expect(result.current.isLoading).toBe(false);
        expect(fetcher).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    it("mostra 'non trovato' se il server risponde 404, senza toast né ritorno all'elenco", async () => {
        const fetcher = vi.fn().mockRejectedValue(notFoundError());

        const { result } = renderHook(() =>
            useEntityDetail("999", fetcher, { backTo: "/reports", errorMessage: "Errore" })
        );

        await waitFor(() => expect(result.current.isNotFound).toBe(true));

        expect(navigate).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    // Il difetto che divideva le cinque schede in due gruppi: report e intervento tornavano
    // all'elenco su un errore diverso da 404, cliente/collaboratore/tecnico no. Ora si
    // comportano tutte come qui.
    it("torna all'elenco con un toast se il caricamento fallisce per un altro motivo", async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error("rete non raggiungibile"));

        renderHook(() => useEntityDetail("5", fetcher, { backTo: "/reports", errorMessage: "Impossibile caricare" }));

        await waitFor(() => expect(navigate).toHaveBeenCalledWith("/reports"));
        expect(toastError).toHaveBeenCalledWith("rete non raggiungibile");
    });

    /**
     * Il difetto che l'hook corregge (D8): prima `isNotFound` non si azzerava mai al cambio
     * di `:id`, quindi aprendo un record valido dopo un "non trovato" (dalla ricerca globale,
     * da una notifica) la scheda restava "non trovata" anche se il nuovo id esisteva.
     */
    it("azzera 'non trovato' quando l'id cambia e il nuovo esiste", async () => {
        const fetcher = vi.fn().mockRejectedValueOnce(notFoundError()).mockResolvedValueOnce({ id: 6, name: "Luca" });

        const { result, rerender } = renderHook(
            ({ id }: { id: string }) => useEntityDetail(id, fetcher, { backTo: "/reports", errorMessage: "Errore" }),
            { initialProps: { id: "999" } }
        );

        await waitFor(() => expect(result.current.isNotFound).toBe(true));

        rerender({ id: "6" });

        // Azzerato subito, prima ancora che la nuova richiesta risponda: altrimenti la
        // scheda mostrerebbe "non trovato" per un istante anche per un id che esiste.
        expect(result.current.isNotFound).toBe(false);
        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.data).toEqual({ id: 6, name: "Luca" });
        expect(result.current.isNotFound).toBe(false);
    });

    it("scarta la risposta di una richiesta superata da un cambio di id", async () => {
        const first = createDeferred<{ id: number; name: string }>();
        const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ id: 6, name: "Luca" });

        const { result, rerender } = renderHook(
            ({ id }: { id: string }) => useEntityDetail(id, fetcher, { backTo: "/reports", errorMessage: "Errore" }),
            { initialProps: { id: "5" } }
        );

        rerender({ id: "6" });

        await waitFor(() => expect(result.current.data).toEqual({ id: 6, name: "Luca" }));

        await act(async () => {
            first.resolve({ id: 5, name: "Vecchio" });
            await first.promise;
        });

        expect(result.current.data).toEqual({ id: 6, name: "Luca" });
    });

    /**
     * Una `PUT` che restituisce già la riga aggiornata (cliente, collaboratore, tecnico) non
     * deve costringere a un secondo giro di rete solo per rivederla: `setData` la scrive
     * direttamente, senza richiamare la `fetcher`.
     */
    it("setData scrive un dato ottenuto altrove senza richiamare la fetcher", async () => {
        const fetcher = vi.fn().mockResolvedValue({ id: 5, name: "Mario" });

        const { result } = renderHook(() =>
            useEntityDetail("5", fetcher, { backTo: "/reports", errorMessage: "Errore" })
        );

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
            result.current.setData({ id: 5, name: "Mario Rossi" });
        });

        expect(result.current.data).toEqual({ id: 5, name: "Mario Rossi" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("reload ricarica senza mai rifiutare, anche su errore", async () => {
        const fetcher = vi.fn().mockResolvedValue({ id: 5, name: "Mario" });

        const { result } = renderHook(() =>
            useEntityDetail("5", fetcher, { backTo: "/reports", errorMessage: "Errore" })
        );

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        fetcher.mockRejectedValueOnce(new Error("boom"));

        await act(async () => {
            await result.current.reload();
        });

        expect(toastError).toHaveBeenCalledWith("boom");
        expect(navigate).toHaveBeenCalledWith("/reports");
    });
});
