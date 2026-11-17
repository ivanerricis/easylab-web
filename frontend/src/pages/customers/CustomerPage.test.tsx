import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
    listContracts: vi.fn(),
    createContract: vi.fn(),
    listContractPackages: vi.fn(),
    deleteIntervention: vi.fn(),
    sendInterventionEmail: vi.fn(),
    deleteContract: vi.fn(),
    deleteReport: vi.fn(),
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
        listContracts: (...args: unknown[]) => api.listContracts(...args),
        createContract: (...args: unknown[]) => api.createContract(...args),
        listContractPackages: (...args: unknown[]) => api.listContractPackages(...args),
        deleteIntervention: (...args: unknown[]) => api.deleteIntervention(...args),
        sendInterventionEmail: (...args: unknown[]) => api.sendInterventionEmail(...args),
        deleteContract: (...args: unknown[]) => api.deleteContract(...args),
        deleteReport: (...args: unknown[]) => api.deleteReport(...args),
        getReportPrintUrl: (id: number) => `/api/reports/${id}/print`,
        getInterventionPrintUrl: (id: number) => `/api/interventions/${id}/print`,
        getContractPrintUrl: (id: number) => `/api/contracts/${id}/print`,
        getCustomerContractsPrintUrl: (id: number) => `/api/customers/${id}/contracts/print`,
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
    api.listContractPackages.mockResolvedValue([]);
    api.listContracts.mockResolvedValue(
        page([
            {
                id: 21,
                type: "assistance",
                status: "active",
                effectiveStatus: "active",
                termMonths: 12,
                billingMonths: null,
                device: "Server NAS",
                note: null,
                startDate: "2026-06-01",
                endDate: "2027-06-01",
                customerId: 3,
                customerName: "Mario Rossi",
                providerId: 8,
                providerName: "Rossi Informatica",
                assistance: {
                    package: "remote_20",
                    name: "Assistenza Remota Pack 20",
                    includedHours: 20,
                    priceCents: 40000,
                    period: "month",
                    priority: 4,
                    typology: "Teleassistenza, solo software",
                },
                createdAt: "2026-06-01T10:00:00.000Z",
                updatedAt: null,
            },
        ])
    );
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
                type: "material_delivery",
                status: "completed",
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
        expect(
            await within(within(screen.getByRole("tabpanel")).getByRole("table")).findByText("Notebook")
        ).toBeInTheDocument();
    });

    /** L'indirizzo dice il tab: i collegamenti salvati e il ricaricamento non lo perdono. */
    it("apre il tab degli interventi dall'indirizzo", async () => {
        await renderPage("/clients/3/interventions", "/clients/:id/interventions");

        expect(screen.getByRole("tab", { name: "Interventi" })).toHaveAttribute("aria-selected", "true");
        expect(document.title).toBe("Interventi di Mario Rossi · EasyLab");
        expect(screen.getByRole("button", { name: "Stampa resoconto interventi" })).toBeInTheDocument();
    });

    it("gli interventi del cliente hanno le azioni di riga", async () => {
        api.sendInterventionEmail.mockResolvedValue({ message: "Email inviata a mario@example.com" });
        await renderPage("/clients/3/interventions", "/clients/:id/interventions");

        const panel = screen.getByRole("tabpanel");
        for (const action of ["Modifica", "Stampa", "Invia email", "Elimina"]) {
            expect(
                (await within(panel).findAllByRole("button", { name: `${action} intervento 9` })).length
            ).toBeGreaterThan(0);
        }
        await userEvent.click(within(panel).getAllByRole("button", { name: "Invia email intervento 9" })[0]);
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Invia" }));

        await waitFor(() => expect(api.sendInterventionEmail).toHaveBeenCalledWith(9));
    });

    it("i report del cliente hanno le azioni di riga, ed eliminarne uno ricarica la scheda", async () => {
        api.deleteReport.mockResolvedValue(undefined);
        await renderPage("/clients/3", "/clients/:id");

        const panel = screen.getByRole("tabpanel");
        for (const action of ["Modifica", "Stampa", "Elimina"]) {
            expect(
                (await within(panel).findAllByRole("button", { name: `${action} report 5` })).length
            ).toBeGreaterThan(0);
        }
        await userEvent.click(within(panel).getAllByRole("button", { name: "Stampa report 5" })[0]);
        expect(openPrintWindow).toHaveBeenCalledWith("/api/reports/5/print");

        const customerLoads = api.getCustomer.mock.calls.length;
        await userEvent.click(within(panel).getAllByRole("button", { name: "Elimina report 5" })[0]);
        const dialog = await screen.findByRole("dialog", { name: "Elimina report" });
        await userEvent.type(within(dialog).getByRole("textbox"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => expect(api.deleteReport).toHaveBeenCalledWith(5));
        await waitFor(() => expect(api.getCustomer.mock.calls.length).toBeGreaterThan(customerLoads));
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

    it("sulle tab report e interventi la stampa apre ancora il dialogo con l'intervallo", async () => {
        await renderPage("/clients/3/interventions", "/clients/:id/interventions");

        await userEvent.click(screen.getByRole("button", { name: "Stampa resoconto interventi" }));

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(openPrintWindow).not.toHaveBeenCalled();
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

        await userEvent.click(screen.getByRole("button", { name: "Nuovo report, intervento o contratto" }));
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

    it("elenca i contratti del cliente nella terza tab, con filtro per stato", async () => {
        await renderPage("/clients/3/contracts", "/clients/:id/contracts");

        expect(screen.getByRole("tab", { name: "Contratti" })).toHaveAttribute("aria-selected", "true");
        expect(api.listContracts).toHaveBeenCalledWith(expect.objectContaining({ customerId: 3, status: "all" }));
        // Tabella e schede mobili mostrano la stessa riga: basta che ci sia.
        expect((await screen.findAllByText("Server NAS")).length).toBeGreaterThan(0);
        const contractRow = screen.getAllByRole("row").find((row) => within(row).queryByText("Server NAS") !== null);
        fireEvent.keyDown(contractRow as HTMLElement, { key: "Enter" });
        expect(navigate).toHaveBeenCalledWith("/contracts/21");
        // La colonna del cliente non c'è: nella sua scheda sarebbe sempre lo stesso nome.
        expect(screen.queryByRole("columnheader", { name: "Cliente" })).not.toBeInTheDocument();
        // L'intestazione stampa il resoconto dei contratti del cliente, subito e senza dialogo.
        await userEvent.click(screen.getByRole("button", { name: "Stampa i contratti del cliente" }));
        expect(openPrintWindow).toHaveBeenCalledWith("/api/customers/3/contracts/print");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        // Il pulsante di riga stampa il PDF di quel contratto.
        await userEvent.click(screen.getAllByRole("button", { name: "Stampa contratto 21" })[0]);
        expect(openPrintWindow).toHaveBeenCalledWith("/api/contracts/21/print");

        // Le altre azioni di riga ci sono, e l'eliminazione ricarica la scheda.
        expect(screen.getAllByRole("button", { name: "Modifica contratto 21" }).length).toBeGreaterThan(0);
        api.deleteContract.mockResolvedValue(undefined);
        const customerLoads = api.getCustomer.mock.calls.length;
        await userEvent.click(screen.getAllByRole("button", { name: "Elimina contratto 21" })[0]);
        const deleteDialog = await screen.findByRole("dialog", { name: "Elimina contratto" });
        await userEvent.type(within(deleteDialog).getByRole("textbox"), "ELIMINA");
        await userEvent.click(within(deleteDialog).getByRole("button", { name: "Elimina" }));
        await waitFor(() => expect(api.deleteContract).toHaveBeenCalledWith(21));
        await waitFor(() => expect(api.getCustomer.mock.calls.length).toBeGreaterThan(customerLoads));

        await userEvent.click(screen.getByRole("combobox", { name: "Filtra i contratti per stato" }));
        await userEvent.click(await screen.findByRole("option", { name: "Scaduto" }));

        await waitFor(() => {
            expect(api.listContracts).toHaveBeenLastCalledWith(expect.objectContaining({ status: "expired" }));
        });
    });

    it("crea un contratto dal menu Nuovo, partendo dal cliente della scheda", async () => {
        await renderPage("/clients/3", "/clients/:id");

        await userEvent.click(screen.getByRole("button", { name: "Nuovo report, intervento o contratto" }));
        await userEvent.click(await screen.findByRole("menuitem", { name: "Nuovo contratto" }));

        expect(await screen.findByRole("dialog", { name: "Nuovo contratto" })).toBeInTheDocument();
        expect(screen.getByLabelText(/^Cliente/)).toHaveValue("Mario Rossi - 333");
    });

    it("apre il report dalla riga", async () => {
        await renderPage("/clients/3", "/clients/:id");

        const table = within(screen.getByRole("tabpanel")).getByRole("table");
        await within(table).findByText("5");
        expect(within(table).queryByRole("link", { name: /^Apri / })).not.toBeInTheDocument();
        fireEvent.keyDown(within(table).getAllByRole("row")[1], { key: "Enter" });
        expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/reports\/\d+$/));
    });

    it("mostra 'non trovato' con un id non valido", async () => {
        renderWithProviders(<CustomerPage />, { route: "/clients/0", path: "/clients/:id" });

        expect(await screen.findByRole("heading", { name: "Cliente non trovato" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Vai ai clienti" })).toHaveAttribute("href", "/clients");
        expect(toastError).not.toHaveBeenCalled();
        expect(api.getCustomer).not.toHaveBeenCalled();
    });
});
