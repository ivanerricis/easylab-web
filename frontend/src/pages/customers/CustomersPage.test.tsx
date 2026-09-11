import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = vi.hoisted(() => ({
    listCustomers: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        listCustomers: (...args: unknown[]) => api.listCustomers(...args),
        createCustomer: (...args: unknown[]) => api.createCustomer(...args),
        updateCustomer: (...args: unknown[]) => api.updateCustomer(...args),
        deleteCustomer: (...args: unknown[]) => api.deleteCustomer(...args),
        getCustomerReportsPrintUrl: (id: number, range: object) => `reports:${id}:${JSON.stringify(range)}`,
        getCustomerInterventionsPrintUrl: (id: number, range: object) => `interventions:${id}:${JSON.stringify(range)}`,
    };
});

const openPrintWindow = vi.fn();

vi.mock("@/lib/utils", async () => {
    const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
    return { ...actual, openPrintWindow: (...args: unknown[]) => openPrintWindow(...args) };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import CustomersPage from "./CustomersPage";
import { renderWithProviders } from "@/test/render";

const customer = {
    id: 3,
    firstName: "Mario",
    lastName: "Rossi",
    phoneNumber: "333",
    phoneNumberSecondary: null,
    email: null,
    city: "Roma",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
};

const table = () => screen.getByRole("table");

const renderPage = async () => {
    renderWithProviders(<CustomersPage />);
    await within(table()).findByText("Mario");
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.listCustomers.mockResolvedValue({ items: [customer], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 });
    api.createCustomer.mockResolvedValue({});
    api.updateCustomer.mockResolvedValue({});
});

describe("CustomersPage", () => {
    it("ordina per nome di default", async () => {
        await renderPage();

        expect(api.listCustomers).toHaveBeenCalledWith(expect.objectContaining({ sortBy: "name", sortOrder: "asc" }));
    });

    /** Le API distinguono "non compilato" (null) da una stringa vera: le caselle vuote vanno a null. */
    it("crea il cliente con i campi vuoti a null e gli spazi tolti", async () => {
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo cliente" }));
        const dialog = screen.getByRole("dialog", { name: "Nuovo cliente" });
        await userEvent.type(within(dialog).getByLabelText(/^Nome/), "  Anna ");
        await userEvent.type(within(dialog).getByLabelText(/Telefono 1/), " 347 ");
        await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(api.createCustomer).toHaveBeenCalledWith({
                firstName: "Anna",
                lastName: null,
                phoneNumber: "347",
                phoneNumberSecondary: null,
                email: null,
                city: null,
            });
        });
        await waitFor(() => {
            expect(api.listCustomers).toHaveBeenCalledTimes(2);
        });
    });

    it("modifica il cliente della riga", async () => {
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Modifica cliente 3" }));
        const dialog = screen.getByRole("dialog", { name: "Modifica cliente" });
        const city = within(dialog).getByLabelText("Località");
        await waitFor(() => {
            expect(city).toHaveValue("Roma");
        });
        await userEvent.clear(city);
        await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(api.updateCustomer).toHaveBeenCalledWith(
                3,
                expect.objectContaining({ firstName: "Mario", city: null })
            );
        });
    });

    it("stampa i report del cliente nell'intervallo scelto", async () => {
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Stampa resoconto cliente 3" }));
        const dialog = screen.getByRole("dialog", { name: "Stampa resoconto cliente" });
        fireEvent.change(within(dialog).getByLabelText("Da"), { target: { value: "2026-01-01" } });
        await userEvent.click(within(dialog).getByRole("button", { name: "Stampa" }));

        expect(openPrintWindow).toHaveBeenCalledWith('reports:3:{"dateFrom":"2026-01-01","dateTo":""}');
    });

    it("può stampare gli interventi invece dei report", async () => {
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Stampa resoconto cliente 3" }));
        await userEvent.click(screen.getByRole("combobox", { name: "Cosa stampare" }));
        await userEvent.click(await screen.findByRole("option", { name: "Interventi" }));
        fireEvent.change(screen.getByLabelText("A"), { target: { value: "2026-06-30" } });
        await userEvent.click(screen.getByRole("button", { name: "Stampa" }));

        expect(openPrintWindow).toHaveBeenCalledWith('interventions:3:{"dateFrom":"","dateTo":"2026-06-30"}');
    });

    it("apre la scheda del cliente", async () => {
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Apri cliente 3" }));

        expect(navigate).toHaveBeenCalledWith("/clients/3");
    });

    it("elimina dopo la conferma con il nome nella domanda", async () => {
        api.deleteCustomer.mockResolvedValue({});
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Elimina cliente 3" }));
        const dialog = screen.getByRole("dialog", { name: "Elimina cliente" });
        expect(dialog).toHaveAccessibleDescription(/Mario Rossi/);
        await userEvent.type(within(dialog).getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(api.deleteCustomer).toHaveBeenCalledWith(3);
        });
    });
});
