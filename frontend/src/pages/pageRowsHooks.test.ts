import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
const listInterventions = vi.fn();
const listReports = vi.fn();

vi.mock("@/lib/api", async () => ({
    ...(await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors")),
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
    });

    it("useReportsRows passa la visibilità e l'ordinamento", async () => {
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
                sortOption: "customer:asc",
                currentPage: 1,
                pageSize: 10,
            })
        );

        await waitFor(() => {
            expect(result.current.reportRows).toHaveLength(2);
        });
        expect(listReports).toHaveBeenCalledWith(
            expect.objectContaining({ visibility: "open", sortBy: "customer", sortOrder: "asc" })
        );
    });

    it("i tre hook espongono l'errore di caricamento con il messaggio della loro lista", async () => {
        listCustomers.mockRejectedValue(new Error("rete"));
        listInterventions.mockRejectedValue(new Error("rete"));
        listReports.mockRejectedValue(new Error("rete"));

        const customers = renderHook(() =>
            useCustomersRows({ searchText: "", sortOption: "name:asc", currentPage: 1, pageSize: 10 })
        );
        const interventions = renderHook(() =>
            useInterventionsRows({
                searchText: "",
                statusFilter: "all",
                typeFilter: "all",
                sortOption: "createdAt:desc",
                currentPage: 1,
                pageSize: 10,
            })
        );
        const reports = renderHook(() =>
            useReportsRows({
                searchText: "",
                visibilityFilter: "all",
                sortOption: "createdAt:desc",
                currentPage: 1,
                pageSize: 10,
            })
        );

        await waitFor(() => {
            expect(customers.result.current.loadError).toBe("Impossibile caricare i clienti");
            expect(interventions.result.current.loadError).toBe("Impossibile caricare gli interventi");
            expect(reports.result.current.loadError).toBe("Impossibile caricare i report");
        });
    });

    // D11: i tre hook inoltrano `onPageOutOfRange` a `usePaginatedRows`, che lo chiama con
    // l'ultima pagina valida quando quella richiesta la supera (riga eliminata, filtro che
    // riduce i risultati). Facoltativo, quindi retrocompatibile con chi non lo passa: vedi
    // i tre test sopra.
    it("i tre hook avvisano con l'ultima pagina valida quando quella richiesta la supera", async () => {
        const outOfRange = { items: [], totalItems: 8, page: 3, pageSize: 10, totalPages: 2 };
        listCustomers.mockResolvedValue(outOfRange);
        listInterventions.mockResolvedValue(outOfRange);
        listReports.mockResolvedValue(outOfRange);

        const onCustomersPageOutOfRange = vi.fn();
        const onInterventionsPageOutOfRange = vi.fn();
        const onReportsPageOutOfRange = vi.fn();

        renderHook(() =>
            useCustomersRows({
                searchText: "",
                sortOption: "name:asc",
                currentPage: 3,
                pageSize: 10,
                onPageOutOfRange: onCustomersPageOutOfRange,
            })
        );
        renderHook(() =>
            useInterventionsRows({
                searchText: "",
                statusFilter: "all",
                typeFilter: "all",
                sortOption: "createdAt:desc",
                currentPage: 3,
                pageSize: 10,
                onPageOutOfRange: onInterventionsPageOutOfRange,
            })
        );
        renderHook(() =>
            useReportsRows({
                searchText: "",
                visibilityFilter: "all",
                sortOption: "createdAt:desc",
                currentPage: 3,
                pageSize: 10,
                onPageOutOfRange: onReportsPageOutOfRange,
            })
        );

        await waitFor(() => {
            expect(onCustomersPageOutOfRange).toHaveBeenCalledWith(2);
            expect(onInterventionsPageOutOfRange).toHaveBeenCalledWith(2);
            expect(onReportsPageOutOfRange).toHaveBeenCalledWith(2);
        });
    });

    /**
     * `queryKey` è costruita dagli stessi parametri della richiesta: cambiare un filtro deve
     * far ripartire il caricamento con il valore nuovo. Qui si cambiano filtri diversi dalla
     * pagina (tipo di intervento, data finale dei report), quelli che una chiave copiata a mano
     * rischiava di dimenticare.
     */
    it("ricaricano quando cambia un filtro, con il valore nuovo", async () => {
        listInterventions.mockResolvedValue(page([]));
        listReports.mockResolvedValue(page([]));

        const interventions = renderHook(
            ({ typeFilter }: { typeFilter: "all" | "intervento_sede" }) =>
                useInterventionsRows({
                    searchText: "",
                    statusFilter: "all",
                    typeFilter,
                    sortOption: "createdAt:desc",
                    currentPage: 1,
                    pageSize: 10,
                }),
            { initialProps: { typeFilter: "all" } }
        );
        const reports = renderHook(
            ({ dateTo }: { dateTo?: string }) =>
                useReportsRows({
                    searchText: "",
                    visibilityFilter: "all",
                    sortOption: "createdAt:desc",
                    dateTo,
                    currentPage: 1,
                    pageSize: 10,
                }),
            { initialProps: { dateTo: undefined } as { dateTo?: string } }
        );

        await waitFor(() => {
            expect(listInterventions).toHaveBeenCalledTimes(1);
            expect(listReports).toHaveBeenCalledTimes(1);
        });

        interventions.rerender({ typeFilter: "intervento_sede" });
        reports.rerender({ dateTo: "2026-09-30" });

        await waitFor(() => {
            expect(listInterventions).toHaveBeenCalledTimes(2);
            expect(listReports).toHaveBeenCalledTimes(2);
        });
        expect(listInterventions).toHaveBeenLastCalledWith(expect.objectContaining({ type: "intervento_sede" }));
        expect(listReports).toHaveBeenLastCalledWith(expect.objectContaining({ dateTo: "2026-09-30" }));
    });

    it("non ricaricano se i parametri restano gli stessi", async () => {
        listCustomers.mockResolvedValue(page([]));

        const customers = renderHook(() =>
            useCustomersRows({ searchText: "", sortOption: "name:asc", currentPage: 1, pageSize: 10 })
        );

        await waitFor(() => {
            expect(listCustomers).toHaveBeenCalledTimes(1);
        });
        customers.rerender();
        // Lascia girare gli effetti del nuovo render prima di contare le chiamate.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(listCustomers).toHaveBeenCalledTimes(1);
    });

    /** Un ordinamento che l'API non conosce (un indirizzo scritto a mano) ricade su quello predefinito. */
    it("con un ordinamento sconosciuto usano quello predefinito della lista", async () => {
        listCustomers.mockResolvedValue(page([]));
        listInterventions.mockResolvedValue(page([]));
        listReports.mockResolvedValue(page([]));

        renderHook(() =>
            useCustomersRows({
                searchText: "",
                sortOption: "total:asc" as never,
                currentPage: 1,
                pageSize: 10,
            })
        );
        renderHook(() =>
            useInterventionsRows({
                searchText: "",
                statusFilter: "all",
                typeFilter: "all",
                sortOption: "interventionDate:sideways" as never,
                currentPage: 1,
                pageSize: 10,
            })
        );
        renderHook(() =>
            useReportsRows({
                searchText: "",
                visibilityFilter: "all",
                sortOption: "" as never,
                currentPage: 1,
                pageSize: 10,
            })
        );

        await waitFor(() => {
            expect(listCustomers).toHaveBeenCalledWith(expect.objectContaining({ sortBy: "name", sortOrder: "asc" }));
            expect(listInterventions).toHaveBeenCalledWith(
                expect.objectContaining({ sortBy: "createdAt", sortOrder: "desc" })
            );
            expect(listReports).toHaveBeenCalledWith(
                expect.objectContaining({ sortBy: "createdAt", sortOrder: "desc" })
            );
        });
    });
});
