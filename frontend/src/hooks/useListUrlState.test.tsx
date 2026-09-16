import { act, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { readDateParam, readEnumParam, useListUrlState, useUrlSearchText } from "./useListUrlState";
import { currentLocation } from "@/test/currentLocation";
import { LocationProbe } from "@/test/locationProbe";
import { renderWithProviders } from "@/test/render";

const routerAt =
    (route: string) =>
    ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;

describe("readEnumParam / readDateParam", () => {
    it("accettano solo i valori previsti", () => {
        const params = new URLSearchParams("status=completato&type=boh&from=2026-09-01&to=ieri");

        expect(readEnumParam(params, "status", ["all", "completato"], "all")).toBe("completato");
        expect(readEnumParam(params, "type", ["all", "sede"], "all")).toBe("all");
        expect(readEnumParam(params, "manca", ["all"], "all")).toBe("all");
        expect(readDateParam(params, "from")).toBe("2026-09-01");
        expect(readDateParam(params, "to")).toBeUndefined();
    });
});

describe("useListUrlState", () => {
    it("legge la pagina, e ignora quelle impossibili", () => {
        for (const [route, page] of [
            ["/x?page=4", 4],
            ["/x", 1],
            ["/x?page=0", 1],
            ["/x?page=2.5", 1],
            ["/x?page=abc", 1],
        ] as const) {
            const { result } = renderHook(() => useListUrlState(), { wrapper: routerAt(route) });
            expect(result.current.currentPage).toBe(page);
        }
    });

    it("ogni modifica che non riguarda la pagina la riporta alla prima, in una scrittura sola", () => {
        const { result } = renderHook(() => useListUrlState(), { wrapper: routerAt("/x?page=3&q=rossi") });

        act(() => result.current.updateParams({ sort: "name:asc", q: null }));

        expect(result.current.currentPage).toBe(1);
        expect(result.current.searchParams.toString()).toBe("sort=name%3Aasc");
    });

    it("cambia pagina senza toccare il resto, e la prima pagina non si scrive", () => {
        const { result } = renderHook(() => useListUrlState(), { wrapper: routerAt("/x?q=rossi") });

        act(() => result.current.setCurrentPage(5));
        expect(result.current.searchParams.toString()).toBe("q=rossi&page=5");

        act(() => result.current.setCurrentPage(1));
        expect(result.current.searchParams.toString()).toBe("q=rossi");
    });
});

/** Un campo di ricerca minimo, con un pulsante che cambia l'indirizzo "da fuori". */
const SearchField = () => {
    const navigate = useNavigate();
    const { searchParams, updateParams } = useListUrlState();
    const committed = searchParams.get("q") ?? "";
    const [draft, setDraft] = useUrlSearchText(committed, (value) => updateParams({ q: value }));

    return (
        <>
            <input aria-label="Cerca" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <button onClick={() => navigate("/x?q=bianchi")}>Link esterno</button>
        </>
    );
};

describe("useUrlSearchText", () => {
    it("scrive nell'indirizzo solo dopo la pausa di battitura", async () => {
        renderWithProviders(
            <>
                <SearchField />
                <LocationProbe />
            </>,
            { route: "/x?page=2" }
        );

        await userEvent.type(screen.getByRole("textbox", { name: "Cerca" }), "ros");
        // Subito dopo la battitura l'indirizzo è ancora quello di prima.
        expect(currentLocation().params).toEqual({ page: "2" });

        await screen.findByText("/x?q=ros");
        expect(screen.getByRole("textbox", { name: "Cerca" })).toHaveValue("ros");
    });

    /** "Indietro", un link o la ricerca globale che porta qui con `?q=`: il campo si riallinea. */
    it("si riallinea quando l'indirizzo cambia da fuori, senza riscriverlo", async () => {
        renderWithProviders(
            <>
                <SearchField />
                <LocationProbe />
            </>,
            { route: "/x?q=rossi" }
        );
        expect(screen.getByRole("textbox", { name: "Cerca" })).toHaveValue("rossi");

        await userEvent.click(screen.getByRole("button", { name: "Link esterno" }));

        expect(screen.getByRole("textbox", { name: "Cerca" })).toHaveValue("bianchi");
        // Dopo la pausa il vecchio testo non torna nell'indirizzo.
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(currentLocation().params).toEqual({ q: "bianchi" });
    });
});
