import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
const listInterventions = vi.fn();
const listReports = vi.fn();

vi.mock("@/lib/api", () => ({
    listCustomers: (...args: unknown[]) => listCustomers(...args),
    listInterventions: (...args: unknown[]) => listInterventions(...args),
    listReports: (...args: unknown[]) => listReports(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { useCustomersRows } from "./customers/hooks/useCustomersRows";
import { useInterventionsRows } from "./interventions/hooks/useInterventionsRows";
import { useReportsRows } from "./reports/hooks/useReportsRows";

const page = <T>(items: T[]) => ({ items, totalItems: items.length, page: 1, pageSize: 10, totalPages: 1 });

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * I tre hook delle liste principali traducono lo stato dei filtri della pagina nei parametri
 * dell'API: l'ordinamento arriva come "campo:verso" dal select e va spezzato.
 */
describe("hook delle righe delle pagine", () => {
    it("useCustomersRows spezza l'ordinamento e passa ricerca e paginazione", async () => {
        listCustomers.mockResolvedValue(page([{ id: 1 }]));

        const { result } = renderHook(() =>
            useCustomersRows({ searchText: "rossi", sortOption: "name:asc", currentPage: 2, pageSize: 20 })
        );

        await waitFor(() => {
            expect(result.current.customerRows).toEqual([{ id: 1 }]);
        });
        expect(listCustomers).toHaveBeenCalledWith({
            page: 2,
            pageSize: 20,
            search: "rossi",
            sortBy: "name",
            sortOrder: "asc",
            signal: expect.any(AbortSignal),
        });
    });

    it("useInterventionsRows passa stato, tipo e intervallo di date", async () => {
        listInterventions.mockResolvedValue(page([{ id: 1, status: "programmato" }]));

        const { result } = renderHook(() =>
            useInterventionsRows({
                searchText: "",
                statusFilter: "programmato",
                typeFilter: "consegna_materiale",
                sortOption: "interventionDate:desc",
                dateFrom: "2026-09-01",
                dateTo: "2026-09-30",
                currentPage: 1,
                pageSize: 10,
            })
        );

        await waitFor(() => {
            expect(result.current.interventionRows).toHaveLength(1);
        });
        expect(listInterventions).toHaveBeenCalledWith({
            page: 1,
            pageSize: 10,
            search: "",
            status: "programmato",
            type: "consegna_materiale",
            sortBy: "interventionDate",
            sortOrder: "desc",
            dateFrom: "2026-09-01",
            dateTo: "2026-09-30",
            signal: expect.any(AbortSignal),
        });

        act(() => {
            result.current.updateInterventionRow(1, (row) => ({ ...row, status: "completato" }));
        });

        expect(result.current.interventionRows).toEqual([{ id: 1, status: "completato" }]);
    });

    it("useReportsRows passa la visibilità e aggiorna la sola riga indicata", async () => {
        listReports.mockResolvedValue(
            page([
                { id: 1, closed: false },
                { id: 2, closed: false },
            ])
        );

        const { result } = renderHook(() =>
            useReportsRows({
                searchText: "",
                visibilityFilter: "open",
                sortOption: "totalPrice:asc",
                currentPage: 1,
                pageSize: 10,
            })
        );

        await waitFor(() => {
            expect(result.current.reportRows).toHaveLength(2);
        });
        expect(listReports).toHaveBeenCalledWith(
            expect.objectContaining({ visibility: "open", sortBy: "totalPrice", sortOrder: "asc" })
        );

        act(() => {
            result.current.updateReportRow(2, (row) => ({ ...row, closed: true }));
        });

        expect(result.current.reportRows).toEqual([
            { id: 1, closed: false },
            { id: 2, closed: true },
        ]);
    });
});
