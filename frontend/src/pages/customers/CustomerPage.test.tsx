import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = vi.hoisted(() => ({
    getCustomer: vi.fn(),
    listReports: vi.fn(),
    listInterventions: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        getCustomer: (...args: unknown[]) => api.getCustomer(...args),
        listReports: (...args: unknown[]) => api.listReports(...args),
        listInterventions: (...args: unknown[]) => api.listInterventions(...args),
        getCustomerReportsPrintUrl: (id: number) => `reports:${id}`,
        getCustomerInterventionsPrintUrl: (id: number) => `interventions:${id}`,
    };
});

const openPrintWindow = vi.fn();

vi.mock("@/lib/utils", async () => {
    const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
    return { ...actual, openPrintWindow: (...args: unknown[]) => openPrintWindow(...args) };
});

const toastError = vi.fn();

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));

import CustomerPage from "./CustomerPage";
import { renderWithProviders } from "@/test/render";

const page = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 10, totalPages: 1 });

const renderPage = async (route: string, path: string) => {
    renderWithProviders(<CustomerPage />, { route, path });
    await screen.findByRole("heading", { level: 1, name: "Mario Rossi" });
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getCustomer.mockResolvedValue({
        id: 3,
        firstName: "Mario",
        lastName: "Rossi",
        phoneNumber: "333",
        phoneNumberSecondary: null,
        email: "mario@example.com",
        city: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: null,
    });
    api.listReports.mockResolvedValue(
        page([
            {
                id: 5,
                customer: "Mario Rossi",
                device: "Notebook",
                issue: "Schermo rotto",
                closed: false,
                totalPrice: 0,
                createdAt: "2026-09-01T10:00:00.000Z",
            },
        ])
    );
    api.listInterventions.mockResolvedValue(
        page([
            {
                id: 9,
                type: "consegna_materiale",
                status: "completato",
                customer: "Mario Rossi",
                collaborator: "Luca",
                interventionDate: "2026-09-02",
                startTime: null,
                endTime: null,
                createdAt: "2026-09-01T10:00:00.000Z",
            },
        ])
    );
});

describe("CustomerPage", () => {
    it("mostra i dati del cliente e i suoi report", async () => {
        await renderPage("/clients/3", "/clients/:id");

        expect(document.title).toBe("Mario Rossi · EasyLab");
        expect(screen.getByText("mario@example.com")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Report" })).toHaveAttribute("aria-selected", "true");
        expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ customerId: 3, visibility: "all" }));
        expect(await within(screen.getByRole("table")).findByText("Notebook")).toBeInTheDocument();
    });

    /** L'indirizzo dice il tab: i collegamenti salvati e il ricaricamento non lo perdono. */
    it("apre il tab degli interventi dall'indirizzo", async () => {
        await renderPage("/clients/3/interventions", "/clients/:id/interventions");

        expect(screen.getByRole("tab", { name: "Interventi" })).toHaveAttribute("aria-selected", "true");
        expect(document.title).toBe("Interventi di Mario Rossi · EasyLab");
        expect(screen.getByRole("button", { name: "Stampa resoconto interventi" })).toBeInTheDocument();
    });

    it("cambiando tab cambia l'indirizzo, senza aggiungere voci alla cronologia", async () => {
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(screen.getByRole("tab", { name: "Interventi" }));

        expect(navigate).toHaveBeenCalledWith("/clients/3/interventions", { replace: true });
    });

    it("la stampa segue il tab", async () => {
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(screen.getByRole("button", { name: "Stampa resoconto report" }));
        await userEvent.click(screen.getByRole("button", { name: "Stampa" }));
        await userEvent.click(screen.getByRole("button", { name: "Stampa tutto" }));

        expect(openPrintWindow).toHaveBeenCalledWith("reports:3");
    });

    it("filtra i report per stato sul server", async () => {
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(screen.getByRole("combobox", { name: "Filtra i report per stato" }));
        await userEvent.click(await screen.findByRole("option", { name: "Report chiusi" }));

        await waitFor(() => {
            expect(api.listReports).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: "closed" }));
        });
    });

    it("apre il report dalla riga", async () => {
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(await within(screen.getByRole("table")).findByRole("button", { name: "Apri report 5" }));

        expect(navigate).toHaveBeenCalledWith("/reports/5");
    });

    it("torna all'elenco con un id non valido", async () => {
        renderWithProviders(<CustomerPage />, { route: "/clients/0", path: "/clients/:id" });

        await waitFor(() => {
            expect(navigate).toHaveBeenCalledWith("/clients");
        });
        expect(toastError).toHaveBeenCalledWith("Cliente non valido");
        expect(api.getCustomer).not.toHaveBeenCalled();
    });
});
