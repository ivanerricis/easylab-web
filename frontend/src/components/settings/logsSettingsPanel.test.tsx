import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getLogRetention: vi.fn(),
    updateLogRetention: vi.fn(),
    listLogFiles: vi.fn(),
    listLogEntries: vi.fn(),
    getLogDownloadUrl: vi.fn(() => "/download"),
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

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import LogsSettingsPanel from "./logsSettingsPanel";
import { renderWithProviders } from "@/test/render";

const files = [{ dayKey: "2026-09-20", sizeBytes: 1000, updatedAt: "2026-09-20T00:00:00.000Z" }];

const page = <T,>(items: T[]) => ({ items, totalItems: items.length, page: 1, pageSize: 50, totalPages: 1 });

const entry = (action: string) => ({
    timestamp: "2026-09-20T10:00:00.000Z",
    ip: "1.2.3.4",
    user: "admin",
    action,
    status: 200,
    error: null,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    api.getLogRetention.mockResolvedValue({ maxDays: 30 });
    api.listLogFiles.mockResolvedValue(files);
});

describe("LogsSettingsPanel: risposte superate", () => {
    /**
     * D9: prima la lista gestiva la paginazione a mano, senza la guardia di `usePaginatedRows`
     * contro le risposte fuori ordine. Se la richiesta senza filtro (partita al montaggio)
     * arrivava dopo quella con la ricerca già scritta, la tabella tornava a mostrare i
     * risultati vecchi sopra quelli appena cercati.
     */
    it("non lascia che la richiesta iniziale, più lenta, sovrascriva la ricerca già digitata", async () => {
        let resolveInitial!: (value: unknown) => void;
        api.listLogEntries.mockImplementation((_dayKey: string, params: { search?: string } = {}) => {
            if (!params.search) {
                return new Promise((resolve) => {
                    resolveInitial = resolve;
                });
            }
            return Promise.resolve(page([entry("login riuscito")]));
        });

        renderWithProviders(<LogsSettingsPanel />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        const table = screen.getByRole("table");
        expect(within(table).getByText("Caricamento log...")).toBeInTheDocument();

        // La ricerca parte con debounce: la richiesta filtrata arriva e si risolve prima di
        // quella iniziale, che resta sospesa.
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "login" } });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(within(table).getByText("login riuscito")).toBeInTheDocument();

        // La richiesta iniziale, superata, arriva ora: non deve rimpiazzare la tabella.
        await act(async () => {
            resolveInitial(page([entry("richiesta vecchia")]));
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(within(table).getByText("login riuscito")).toBeInTheDocument();
        expect(within(table).queryByText("richiesta vecchia")).not.toBeInTheDocument();
    });
});

describe("LogsSettingsPanel: data del log", () => {
    it("mostra la data del file senza l'orario", async () => {
        api.listLogEntries.mockResolvedValue(page([]));

        renderWithProviders(<LogsSettingsPanel />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByText(/20\/09\/2026/)).toBeInTheDocument();
    });
});
