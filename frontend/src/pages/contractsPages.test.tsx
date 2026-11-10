import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = vi.hoisted(() => ({
    listContracts: vi.fn(),
    getContract: vi.fn(),
    listProviders: vi.fn(),
    getProvider: vi.fn(),
    listInterventions: vi.fn(),
    deleteContract: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forwarded = Object.fromEntries(
        Object.keys(api).map((name) => [
            name,
            (...args: unknown[]) => (api[name as keyof typeof api] as (...a: unknown[]) => unknown)(...args),
        ])
    );
    return {
        ...errors,
        ...forwarded,
        createContract: vi.fn(),
        updateContract: vi.fn(),
        createProvider: vi.fn(),
        updateProvider: vi.fn(),
        deleteProvider: vi.fn(),
        listCustomers: vi.fn(),
        getContractPrintUrl: (id: number) => `/api/contracts/${id}/print`,
    };
});

const openPrintWindow = vi.fn();

vi.mock("@/lib/utils", async () => {
    const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
    return { ...actual, openPrintWindow: (...args: unknown[]) => openPrintWindow(...args) };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ContractPage from "./contracts/ContractPage";
import ContractsPage from "./contracts/ContractsPage";
import ProviderPage from "./providers/ProviderPage";
import ProvidersPage from "./providers/ProvidersPage";
import { renderWithProviders } from "@/test/render";
import type { ContractDto } from "@/types/dtos";

const page = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 10, totalPages: 1 });

const contract = (overrides: Partial<ContractDto> = {}): ContractDto => ({
    id: 21,
    type: "assistance",
    status: "active",
    effectiveStatus: "active",
    termMonths: 12,
    billingMonths: null,
    device: "Server NAS",
    note: "Rinnovo automatico",
    startDate: "2026-06-01",
    endDate: "2027-06-01",
    customerId: 3,
    customerName: "Mario Rossi",
    providerId: 8,
    providerName: "Rossi Informatica",
    assistance: { assistanceType: "remote", includedHours: 10 },
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: null,
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.listContracts.mockResolvedValue(
        page([contract(), contract({ id: 22, effectiveStatus: "expired", device: "Firewall" })])
    );
    api.listInterventions.mockResolvedValue(page([]));
});

describe("ContractsPage", () => {
    it("elenca i contratti con pacchetto e stato, incluso Scaduto", async () => {
        renderWithProviders(<ContractsPage />, { route: "/contracts" });

        const table = await screen.findByRole("table");
        expect(await within(table).findByText("Server NAS")).toBeInTheDocument();
        expect(within(table).getAllByText("Remota - 10 h/mese")).toHaveLength(2);
        expect(within(table).getByText("Scaduto")).toBeInTheDocument();
        expect(within(table).getByText("Attivo")).toBeInTheDocument();
        for (const header of ["Cliente", "Fornitore", "Tipo", "Pacchetto", "Dispositivo", "Inizio", "Fine", "Stato"]) {
            expect(within(table).getByRole("columnheader", { name: new RegExp(header) })).toBeInTheDocument();
        }
        expect(api.listContracts).toHaveBeenCalledWith(
            expect.objectContaining({ type: "all", status: "all", sortBy: "createdAt", sortOrder: "desc" })
        );
    });

    it("manda al server filtri e ricerca letti dall'indirizzo", async () => {
        renderWithProviders(<ContractsPage />, {
            route: "/contracts?type=rental&status=expired&sort=endDate:asc&q=nas",
        });

        await waitFor(() => {
            expect(api.listContracts).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "rental",
                    status: "expired",
                    search: "nas",
                    sortBy: "endDate",
                    sortOrder: "asc",
                })
            );
        });
    });

    it("cambiando il filtro di stato ricarica la lista", async () => {
        renderWithProviders(<ContractsPage />, { route: "/contracts" });
        await screen.findByRole("table");

        await userEvent.click(screen.getByRole("combobox", { name: "Filtra per stato" }));
        await userEvent.click(await screen.findByRole("option", { name: "Scaduto" }));

        await waitFor(() => {
            expect(api.listContracts).toHaveBeenLastCalledWith(expect.objectContaining({ status: "expired" }));
        });
    });

    it("stampa dalla riga: contratto per l'attivo, preventivo per la bozza", async () => {
        api.listContracts.mockResolvedValue(page([contract(), contract({ id: 23, effectiveStatus: "draft" })]));
        renderWithProviders(<ContractsPage />, { route: "/contracts" });
        const table = await screen.findByRole("table");

        await userEvent.click(await within(table).findByRole("button", { name: "Stampa contratto 21" }));
        expect(openPrintWindow).toHaveBeenLastCalledWith("/api/contracts/21/print");

        await userEvent.click(within(table).getByRole("button", { name: "Stampa preventivo 23" }));
        expect(openPrintWindow).toHaveBeenLastCalledWith("/api/contracts/23/print");
    });

    it("dice quando nessun contratto corrisponde ai filtri", async () => {
        api.listContracts.mockResolvedValue(page([]));
        renderWithProviders(<ContractsPage />, { route: "/contracts?status=draft" });

        expect((await screen.findAllByText("Nessun contratto corrisponde ai filtri.")).length).toBeGreaterThan(0);
    });
});

describe("ContractPage", () => {
    const renderPage = async () => {
        renderWithProviders(<ContractPage />, { route: "/contracts/21", path: "/contracts/:id" });
        await screen.findByRole("heading", { level: 1 });
    };

    it("mostra i dati, la barra delle ore, lo storico e gli interventi collegati", async () => {
        api.getContract.mockResolvedValue(
            contract({
                hours: { month: "2026-10", usedHours: 12, includedHours: 10, remainingHours: -2 },
                monthlyHours: [
                    { month: "2026-09", usedHours: 4 },
                    { month: "2026-10", usedHours: 12 },
                ],
            })
        );
        api.listInterventions.mockResolvedValue(
            page([
                {
                    id: 9,
                    type: "remote",
                    status: "completed",
                    customer: "Mario Rossi",
                    collaborator: "Luca",
                    interventionDate: "2026-10-02",
                    startTime: null,
                    endTime: null,
                    contractId: 21,
                    createdAt: "2026-10-02T10:00:00.000Z",
                },
            ])
        );
        await renderPage();

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Contratto #21 - Mario Rossi");
        expect(screen.getByText("Rinnovo automatico")).toBeInTheDocument();
        // Oltre il pacchetto: la barra è piena e l'eccesso scritto.
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
        expect(screen.getByRole("alert")).toHaveTextContent("Superate di 2 h");
        // Lo storico va dal mese più recente.
        const history = screen.getByRole("heading", { name: "Storico mensile" }).closest("[data-slot=card]");
        const rows = within(history as HTMLElement).getAllByRole("row");
        expect(rows[1]).toHaveTextContent(/ottobre 2026/i);
        expect(rows[1]).toHaveTextContent("120%");
        expect(rows[2]).toHaveTextContent(/settembre 2026/i);
        await waitFor(() => {
            expect(api.listInterventions).toHaveBeenCalledWith(expect.objectContaining({ contractId: 21 }));
        });
        // La riga dell'intervento collegato (non quelle dello storico) si apre da sola con Invio.
        await waitFor(() => {
            const linkedRows = screen
                .getAllByRole("row")
                .filter(
                    (row) => !(history as HTMLElement).contains(row) && within(row).queryAllByRole("cell").length > 0
                );
            expect(linkedRows.length).toBeGreaterThan(0);
            fireEvent.keyDown(linkedRows[0], { key: "Enter" });
            expect(navigate).toHaveBeenCalledWith("/interventions/9");
        });
    });

    it("Stampa apre il PDF del contratto", async () => {
        api.getContract.mockResolvedValue(contract());
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Stampa contratto" }));
        expect(openPrintWindow).toHaveBeenCalledWith("/api/contracts/21/print");
    });

    it("con una bozza il pulsante dice Stampa preventivo", async () => {
        api.getContract.mockResolvedValue(contract({ status: "draft", effectiveStatus: "draft" }));
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Stampa preventivo" }));
        expect(openPrintWindow).toHaveBeenCalledWith("/api/contracts/21/print");
    });

    it("per il full time scrive Ore illimitate", async () => {
        api.getContract.mockResolvedValue(
            contract({
                assistance: { assistanceType: "full_time", includedHours: null },
                hours: { month: "2026-10", usedHours: 30, includedHours: null, remainingHours: null },
                monthlyHours: [],
            })
        );
        await renderPage();

        expect(screen.getAllByText("Ore illimitate").length).toBeGreaterThan(0);
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("un noleggio non ha ore né interventi", async () => {
        api.getContract.mockResolvedValue(contract({ type: "rental", assistance: null }));
        await renderPage();

        expect(screen.queryByRole("heading", { name: "Ore del mese" })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Interventi collegati" })).not.toBeInTheDocument();
        expect(api.listInterventions).not.toHaveBeenCalled();
    });
});

describe("ProvidersPage", () => {
    it("elenca i fornitori", async () => {
        api.listProviders.mockResolvedValue(
            page([
                {
                    id: 8,
                    providerName: "Rossi Informatica",
                    firstName: "Anna",
                    lastName: null,
                    email: "info@rossi.it",
                    phoneNumber: "081 123",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: null,
                },
            ])
        );
        renderWithProviders(<ProvidersPage />, { route: "/providers" });

        const table = await screen.findByRole("table");
        expect(await within(table).findByText("Rossi Informatica")).toBeInTheDocument();
        expect(within(table).getByText("info@rossi.it")).toBeInTheDocument();
        expect(within(table).queryByRole("link", { name: /^Apri / })).not.toBeInTheDocument();
        fireEvent.keyDown(within(table).getAllByRole("row")[1], { key: "Enter" });
        expect(navigate).toHaveBeenCalledWith("/providers/8");
    });
});

describe("ProviderPage", () => {
    it("mostra i dati del fornitore e i suoi contratti", async () => {
        api.getProvider.mockResolvedValue({
            id: 8,
            providerName: "Rossi Informatica",
            firstName: "Anna",
            lastName: "Verdi",
            email: "info@rossi.it",
            phoneNumber: "081 123",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: null,
        });
        renderWithProviders(<ProviderPage />, { route: "/providers/8", path: "/providers/:id" });

        expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Rossi Informatica");
        expect(screen.getByText("Anna Verdi")).toBeInTheDocument();
        expect(api.listContracts).toHaveBeenCalledWith(expect.objectContaining({ providerId: 8 }));
        expect((await screen.findAllByText("Server NAS")).length).toBeGreaterThan(0);
    });
});
