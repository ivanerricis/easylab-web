import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { useSearchableRows } from "./useSearchableRows";

const emptyPage = { items: [], totalItems: 0, page: 1, pageSize: 10, totalPages: 0 };

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

const flush = async () => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
};

describe("useSearchableRows", () => {
    it("chiede la pagina con ricerca, dimensione e signal", async () => {
        const fetchRows = vi.fn().mockResolvedValue(emptyPage);

        renderHook(() =>
            useSearchableRows({ fetchRows, searchText: "mario", currentPage: 2, pageSize: 20, errorMessage: "Errore" })
        );
        await flush();

        expect(fetchRows).toHaveBeenCalledWith({
            page: 2,
            pageSize: 20,
            search: "mario",
            signal: expect.any(AbortSignal),
        });
    });

    /** Una richiesta per tasto premuto intaserebbe il server mentre si scrive. */
    it("aspetta la pausa nella digitazione prima di cercare", async () => {
        const fetchRows = vi.fn().mockResolvedValue(emptyPage);

        const { rerender } = renderHook(
            ({ searchText }: { searchText: string }) =>
                useSearchableRows({ fetchRows, searchText, currentPage: 1, pageSize: 10, errorMessage: "Errore" }),
            { initialProps: { searchText: "" } }
        );
        await flush();
        expect(fetchRows).toHaveBeenCalledTimes(1);

        rerender({ searchText: "m" });
        rerender({ searchText: "ma" });
        rerender({ searchText: "mar" });
        await flush();
        expect(fetchRows).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(fetchRows).toHaveBeenCalledTimes(2);
        expect(fetchRows).toHaveBeenLastCalledWith(expect.objectContaining({ search: "mar" }));
    });

    it("ricarica subito al cambio di pagina", async () => {
        const fetchRows = vi.fn().mockResolvedValue(emptyPage);

        const { rerender } = renderHook(
            ({ currentPage }: { currentPage: number }) =>
                useSearchableRows({ fetchRows, searchText: "", currentPage, pageSize: 10, errorMessage: "Errore" }),
            { initialProps: { currentPage: 1 } }
        );
        await flush();

        rerender({ currentPage: 3 });
        await flush();

        expect(fetchRows).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
    });
});
