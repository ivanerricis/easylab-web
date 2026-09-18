import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportTooLargeError, exportRowLimit, maxPageSize, takeUnpaginated } from "./pagination";

/** Una query finta: restituisce `available` righe, ma mai più di quante ne chiede il `limit`. */
const fakeQuery = (available: number) => {
    const limit = vi.fn(async (count: number) =>
        Array.from({ length: Math.min(available, count) }, (_, id) => ({ id }))
    );

    return { limit };
};

describe("takeUnpaginated", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("sotto il tetto restituisce tutte le righe, chiedendone una in più per accorgersi dello sforamento", async () => {
        const query = fakeQuery(3);

        await expect(takeUnpaginated(query, "prova")).resolves.toHaveLength(3);
        expect(query.limit).toHaveBeenCalledWith(maxPageSize + 1);
    });

    it("per le liste tronca al tetto e lo segnala nei log", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(takeUnpaginated(fakeQuery(maxPageSize + 10), "prova")).resolves.toHaveLength(maxPageSize);
        expect(warn).toHaveBeenCalledOnce();
    });

    it("per gli export alza il tetto e non tronca in silenzio oltre le 5000 righe", async () => {
        const query = fakeQuery(maxPageSize + 10);

        await expect(takeUnpaginated(query, "prova", exportRowLimit)).resolves.toHaveLength(maxPageSize + 10);
        expect(query.limit).toHaveBeenCalledWith(exportRowLimit.maxRows + 1);
    });

    it("per gli export, oltre il tetto rifiuta con un 400 invece di consegnare un file incompleto", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const small = { maxRows: 2, onOverflow: "reject", tooLargeMessage: "Troppe righe" } as const;
        const result = takeUnpaginated(fakeQuery(3), "prova", small);

        await expect(result).rejects.toBeInstanceOf(ExportTooLargeError);
        await expect(result).rejects.toMatchObject({ statusCode: 400, message: "Troppe righe" });
        expect(warn).not.toHaveBeenCalled();
    });
});
