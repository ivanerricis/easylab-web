import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { createContract, deleteContract, getContract, listContracts, updateContract } from "./contracts";
import { createProvider, deleteProvider, getProvider, listProviders, updateProvider } from "./providers";

const raw = { id: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: null };
const mapped = { id: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("contratti", () => {
    it("lista con i filtri e rinomina i timestamp", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({
            data: { items: [raw], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 },
        });
        const controller = new AbortController();

        const result = await listContracts({
            page: 2,
            pageSize: 10,
            search: "  nas ",
            type: "assistance",
            status: "expired",
            customerId: 3,
            providerId: 8,
            sortBy: "endDate",
            sortOrder: "asc",
            signal: controller.signal,
        });

        expect(get).toHaveBeenCalledWith("/contracts", {
            params: {
                page: 2,
                pageSize: 10,
                search: "nas",
                type: "assistance",
                status: "expired",
                customerId: 3,
                providerId: 8,
                sortBy: "endDate",
                sortOrder: "asc",
            },
            signal: controller.signal,
        });
        expect(result.items).toEqual([mapped]);
    });

    it("legge il dettaglio con ore e storico", async () => {
        const hours = { month: "2026-10", usedHours: 3.5, includedHours: 10, remainingHours: 6.5 };
        vi.spyOn(api, "get").mockResolvedValue({
            data: { ...raw, hours, monthlyHours: [{ month: "2026-10", usedHours: 3.5 }] },
        });

        expect(await getContract(1)).toEqual({
            ...mapped,
            hours,
            monthlyHours: [{ month: "2026-10", usedHours: 3.5 }],
        });
        expect(api.get).toHaveBeenCalledWith("/contracts/1");
    });

    it("crea, modifica ed elimina", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: raw });
        const put = vi.spyOn(api, "put").mockResolvedValue({ data: raw });
        const del = vi.spyOn(api, "delete").mockResolvedValue({ data: raw });
        const payload = {
            type: "rental" as const,
            term: "months_3" as const,
            device: "PC",
            startDate: "2026-10-05",
            customerId: 3,
            providerId: 8,
        };

        expect(await createContract(payload)).toEqual(mapped);
        expect(post).toHaveBeenCalledWith("/contracts", payload);
        expect(await updateContract(1, { device: "Server" })).toEqual(mapped);
        expect(put).toHaveBeenCalledWith("/contracts/1", { device: "Server" });
        await deleteContract(1);
        expect(del).toHaveBeenCalledWith("/contracts/1");
    });
});

describe("fornitori", () => {
    it("lista con ordinamento, e senza parametri l'elenco completo", async () => {
        const get = vi
            .spyOn(api, "get")
            .mockResolvedValueOnce({ data: { items: [raw], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 } })
            .mockResolvedValueOnce({ data: [raw] });

        const page = await listProviders({ page: 1, pageSize: 10, sortBy: "providerName", sortOrder: "asc" });
        expect(get).toHaveBeenCalledWith("/providers", {
            params: { page: 1, pageSize: 10, search: undefined, sortBy: "providerName", sortOrder: "asc" },
            signal: undefined,
        });
        expect(page.items).toEqual([mapped]);

        expect(await listProviders()).toEqual([mapped]);
    });

    it("legge, crea, modifica ed elimina", async () => {
        vi.spyOn(api, "get").mockResolvedValue({ data: raw });
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: raw });
        const put = vi.spyOn(api, "put").mockResolvedValue({ data: raw });
        const del = vi.spyOn(api, "delete").mockResolvedValue({ data: raw });
        const payload = { providerName: "Rossi", email: "a@b.it", phoneNumber: "081" };

        expect(await getProvider(1)).toEqual(mapped);
        await createProvider(payload);
        expect(post).toHaveBeenCalledWith("/providers", payload);
        await updateProvider(1, { phoneNumber: "082" });
        expect(put).toHaveBeenCalledWith("/providers/1", { phoneNumber: "082" });
        await deleteProvider(1);
        expect(del).toHaveBeenCalledWith("/providers/1");
    });
});
