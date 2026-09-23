import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const listReports = vi.fn();
const listInterventions = vi.fn();

vi.mock("@/lib/api", () => ({
    listReports: (...args: unknown[]) => listReports(...args),
    listInterventions: (...args: unknown[]) => listInterventions(...args),
}));

import { useReportsAndInterventionsOf } from "./useReportsAndInterventionsOf";

const emptyPage = { items: [], totalItems: 0, page: 1, pageSize: 10, totalPages: 1 };

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listReports.mockResolvedValue(emptyPage);
    listInterventions.mockResolvedValue(emptyPage);
});

describe("useReportsAndInterventionsOf", () => {
    /**
     * D11: come `TechnicianPage` e le pagine con impaginazione, le due liste della scheda
     * cliente/collaboratore devono correggere da sole una pagina che una cancellazione o un
     * filtro hanno reso inesistente — altrimenti restano su una tabella vuota senza
     * impaginazione per tornare indietro (`totalPages <= 1` la nasconde).
     */
    it("riporta la pagina dei report all'ultima valida quando la richiesta la supera", async () => {
        listReports.mockResolvedValue({ items: [], totalItems: 8, page: 3, pageSize: 10, totalPages: 2 });

        const { result } = renderHook(() =>
            useReportsAndInterventionsOf({
                owner: { customerId: 1 },
                tableKeyPrefix: "customer",
                ownerLabel: "del cliente",
            })
        );

        act(() => {
            result.current.reports.setPage(3);
        });

        await waitFor(() => {
            expect(result.current.reports.page).toBe(2);
        });
    });

    it("riporta la pagina degli interventi all'ultima valida quando la richiesta la supera", async () => {
        listInterventions.mockResolvedValue({ items: [], totalItems: 4, page: 5, pageSize: 10, totalPages: 1 });

        const { result } = renderHook(() =>
            useReportsAndInterventionsOf({
                owner: { collaboratorId: 1 },
                tableKeyPrefix: "collaborator",
                ownerLabel: "del collaboratore",
            })
        );

        act(() => {
            result.current.interventions.setPage(5);
        });

        await waitFor(() => {
            expect(result.current.interventions.page).toBe(1);
        });
    });
});
