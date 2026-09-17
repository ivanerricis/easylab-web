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
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
    listDevices: vi.fn(),
    listIssues: vi.fn(),
    listCollaborators: vi.fn(),
    listCustomers: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        getCustomer: (...args: unknown[]) => api.getCustomer(...args),
        listReports: (...args: unknown[]) => api.listReports(...args),
        listInterventions: (...args: unknown[]) => api.listInterventions(...args),
        updateCustomer: (...args: unknown[]) => api.updateCustomer(...args),
        deleteCustomer: (...args: unknown[]) => api.deleteCustomer(...args),
        listDevices: (...args: unknown[]) => api.listDevices(...args),
        listIssues: (...args: unknown[]) => api.listIssues(...args),
        listCollaborators: (...args: unknown[]) => api.listCollaborators(...args),
        listCustomers: (...args: unknown[]) => api.listCustomers(...args),
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
    api.listDevices.mockResolvedValue([]);
    api.listIssues.mockResolvedValue([]);
    api.listCollaborators.mockResolvedValue([]);
    api.listCustomers.mockResolvedValue(page([]));
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

    it("modifica i dati del cliente dalla scheda", async () => {
        api.updateCustomer.mockImplementation(async (id: number, payload: object) => ({
            ...(await api.getCustomer.mock.results[0].value),
            ...payload,
            id,
        }));
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(screen.getByRole("button", { name: "Modifica cliente" }));
        const dialog = await screen.findByRole("dialog");
        const city = within(dialog).getByLabelText(/Località/);
        await userEvent.type(city, "  Roma ");
        await userEvent.click(within(dialog).getByRole("button", { name: /Salva/ }));

        await waitFor(() => {
            expect(api.updateCustomer).toHaveBeenCalledWith(
                3,
                expect.objectContaining({ city: "Roma", lastName: "Rossi" })
            );
        });
        expect(await screen.findByText("Roma")).toBeInTheDocument();
    });

    /** Il cliente della scheda è già scritto e già risolto: il modulo non risulta modificato. */
    it.each([
        ["Nuovo report", "Nuovo report"],
        ["Nuovo intervento", "Nuovo intervento"],
    ])('"%s" apre il dialogo con il cliente già compilato', async (item, dialogTitle) => {
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(screen.getByRole("button", { name: "Nuovo report o intervento" }));
        await userEvent.click(await screen.findByRole("menuitem", { name: item }));

        const dialog = await screen.findByRole("dialog", { name: dialogTitle });
        expect(within(dialog).getByLabelText(/^Cliente/)).toHaveValue("Mario Rossi - 333");

        // Chiudere senza toccare nulla non chiede conferma: il cliente precompilato non è una modifica.
        await userEvent.keyboard("{Escape}");
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("elimina il cliente e torna all'elenco", async () => {
        api.deleteCustomer.mockResolvedValue({});
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(screen.getByRole("button", { name: "Elimina cliente" }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("Mario Rossi");
        await userEvent.type(within(dialog).getByRole("textbox"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(navigate).toHaveBeenCalledWith("/clients", { replace: true });
        });
        expect(api.deleteCustomer).toHaveBeenCalledWith(3);
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

        expect(await within(screen.getByRole("table")).findByRole("link", { name: "Apri report 5" })).toHaveAttribute(
            "href",
            "/reports/5"
        );
    });

    it("mostra 'non trovato' con un id non valido", async () => {
        renderWithProviders(<CustomerPage />, { route: "/clients/0", path: "/clients/:id" });

        expect(await screen.findByRole("heading", { name: "Cliente non trovato" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Vai ai clienti" })).toHaveAttribute("href", "/clients");
        expect(toastError).not.toHaveBeenCalled();
        expect(api.getCustomer).not.toHaveBeenCalled();
    });
});
