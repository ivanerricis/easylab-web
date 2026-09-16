import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    listCustomers: vi.fn(),
    listReports: vi.fn(),
    listInterventions: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return { ...errors, ...api };
});

const toastError = vi.fn();

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

import GlobalSearch from "./global-search";
import { currentLocation } from "@/test/currentLocation";
import { LocationProbe } from "@/test/locationProbe";
import { renderWithProviders } from "@/test/render";

const page = <T,>(items: T[]) => ({ items, totalItems: items.length, page: 1, pageSize: 5, totalPages: 1 });

const timestamps = { createdAt: "2026-09-01T10:00:00.000Z", updatedAt: null };

const customer = {
    id: 3,
    firstName: "Mario",
    lastName: "Rossi",
    phoneNumber: "333 1234567",
    phoneNumberSecondary: null,
    email: null,
    city: null,
    ...timestamps,
};

const report = {
    id: 12,
    customer: "Mario Rossi",
    device: "Notebook",
    issue: "Schermo rotto",
    closed: false,
};

const intervention = {
    id: 9,
    customer: "Mario Rossi",
    type: "intervento_sede",
    status: "programmato",
    interventionDate: "2026-09-20",
};

const renderSearch = () =>
    renderWithProviders(
        <>
            <GlobalSearch />
            <LocationProbe />
        </>,
        { route: "/dashboard" }
    );

const dialog = () => screen.getByRole("dialog", { name: "Ricerca" });
const input = () => within(dialog()).getByRole("combobox");

beforeEach(() => {
    vi.clearAllMocks();
    api.listCustomers.mockResolvedValue(page([customer]));
    api.listReports.mockResolvedValue(page([report]));
    api.listInterventions.mockResolvedValue(page([intervention]));
});

describe("GlobalSearch", () => {
    it("si apre dal pulsante e con Ctrl+K, e mostra le pagine prima di scrivere", async () => {
        renderSearch();

        await userEvent.keyboard("{Control>}k{/Control}");
        expect(dialog()).toBeInTheDocument();
        expect(within(dialog()).getByRole("option", { name: /Tecnici esterni/ })).toBeInTheDocument();
        // Senza testo non si chiede niente al server.
        expect(api.listReports).not.toHaveBeenCalled();

        await userEvent.keyboard("{Escape}");
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));
        expect(dialog()).toBeInTheDocument();
    });

    it("cerca in clienti, report e interventi insieme, e apre il risultato scelto", async () => {
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "rossi");

        const reportOption = await within(dialog()).findByRole("option", { name: /#12.*Mario Rossi/ });
        expect(within(dialog()).getByRole("option", { name: /Mario Rossi.*333 1234567/ })).toBeInTheDocument();
        expect(within(dialog()).getByRole("option", { name: /#9.*Mario Rossi.*Programmato/ })).toBeInTheDocument();
        // Nessun report escluso: la ricerca guarda anche quelli chiusi.
        expect(api.listReports).toHaveBeenCalledWith(
            expect.objectContaining({ search: "rossi", visibility: "all", pageSize: 5 })
        );
        expect(api.listInterventions).toHaveBeenCalledWith(expect.objectContaining({ search: "rossi", status: "all" }));

        await userEvent.click(reportOption);

        expect(currentLocation().pathname).toBe("/reports/12");
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("cerca un numero anche con il cancelletto, e porta alla lista con la ricerca scritta", async () => {
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "#12");

        await within(dialog()).findByRole("option", { name: /#12/ });
        expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ search: "12" }));

        await userEvent.click(within(dialog()).getByRole("option", { name: "Vedi tutti i report trovati" }));

        expect(currentLocation()).toEqual({ pathname: "/reports", params: { visibility: "all", q: "12" } });
    });

    it("con una lettera sola non cerca, e filtra solo le pagine", async () => {
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "d");

        expect(within(dialog()).getByRole("option", { name: /Dashboard/ })).toBeInTheDocument();
        expect(within(dialog()).getByRole("option", { name: /Dispositivi/ })).toBeInTheDocument();
        expect(within(dialog()).queryByRole("option", { name: /Clienti/ })).not.toBeInTheDocument();
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(api.listCustomers).not.toHaveBeenCalled();
    });

    it("dice quando non trova niente", async () => {
        api.listCustomers.mockResolvedValue(page([]));
        api.listReports.mockResolvedValue(page([]));
        api.listInterventions.mockResolvedValue(page([]));
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "zzzz");

        expect(await within(dialog()).findByText('Nessun risultato per "zzzz".')).toBeInTheDocument();
    });

    /** Un gruppo che fallisce non svuota gli altri; l'avviso arriva solo se non risponde nessuno. */
    it("mostra quello che arriva se un gruppo fallisce, e avvisa solo se falliscono tutti", async () => {
        api.listCustomers.mockRejectedValue(new Error("Timeout"));
        renderSearch();
        await userEvent.click(screen.getByRole("button", { name: "Cerca clienti, report e interventi" }));

        await userEvent.type(input(), "rossi");

        expect(await within(dialog()).findByRole("option", { name: /#12/ })).toBeInTheDocument();
        expect(toastError).not.toHaveBeenCalled();

        api.listReports.mockRejectedValue(new Error("Timeout"));
        api.listInterventions.mockRejectedValue(new Error("Timeout"));
        await userEvent.type(input(), "x");

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Timeout");
        });
    });
});
