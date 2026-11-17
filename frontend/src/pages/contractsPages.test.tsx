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
    uploadSignedContract: vi.fn(),
    deleteSignedContract: vi.fn(),
    sendContractEmail: vi.fn(),
    deleteIntervention: vi.fn(),
    sendInterventionEmail: vi.fn(),
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
        listContractPackages: vi.fn().mockResolvedValue([]),
        createProvider: vi.fn(),
        updateProvider: vi.fn(),
        deleteProvider: vi.fn(),
        listCustomers: vi.fn(),
        getContractPrintUrl: (id: number) => `/api/contracts/${id}/print`,
        getProviderContractsPrintUrl: (id: number) => `/api/providers/${id}/contracts/print`,
        getInterventionPrintUrl: (id: number) => `/api/interventions/${id}/print`,
        getSignedContractUrl: (id: number) => `/api/contracts/${id}/signed-contract`,
        signedContractMaxBytes: 15 * 1024 * 1024,
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
import { toast } from "sonner";
import type { ContractAssistanceDto, ContractDto } from "@/types/dtos";

const page = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 10, totalPages: 1 });

const remote20: ContractAssistanceDto = {
    package: "remote_20",
    name: "Assistenza Remota Pack 20",
    includedHours: 20,
    priceCents: 40000,
    period: "month",
    priority: 4,
    typology: "Teleassistenza, solo software",
};

const supportBase: ContractAssistanceDto = {
    package: "support_base",
    name: "Supporto Base",
    includedHours: 80,
    priceCents: 160000,
    period: "contract",
    priority: 2,
    typology: "Teleassistenza, on site e in laboratorio: hardware, software, formazione",
};

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
    assistance: remote20,
    signedContract: null,
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
        expect(within(table).getAllByText("Assistenza Remota Pack 20")).toHaveLength(2);
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
                hours: { period: "month", month: "2026-10", usedHours: 24, includedHours: 20, remainingHours: -4 },
                monthlyHours: [
                    { month: "2026-09", usedHours: 4 },
                    { month: "2026-10", usedHours: 24 },
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
        expect(screen.getByRole("alert")).toHaveTextContent("Superate di 4 h");
        // Lo storico va dal mese più recente.
        const history = screen.getByRole("heading", { name: "Storico mensile" }).closest("[data-slot=card]");
        const rows = within(history as HTMLElement).getAllByRole("row");
        expect(rows[1]).toHaveTextContent(/ottobre 2026/i);
        expect(rows[1]).toHaveTextContent("120%");
        expect(rows[2]).toHaveTextContent("20%");
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

    it("gli interventi collegati hanno le azioni di riga, ed eliminarne uno ricarica la scheda", async () => {
        api.getContract.mockResolvedValue(contract());
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
        api.deleteIntervention.mockResolvedValue(undefined);
        await renderPage();

        for (const action of ["Modifica", "Stampa", "Invia email", "Elimina"]) {
            expect((await screen.findAllByRole("button", { name: `${action} intervento 9` })).length).toBeGreaterThan(
                0
            );
        }
        await userEvent.click(screen.getAllByRole("button", { name: "Stampa intervento 9" })[0]);
        expect(openPrintWindow).toHaveBeenCalledWith("/api/interventions/9/print");

        const contractLoads = api.getContract.mock.calls.length;
        await userEvent.click(screen.getAllByRole("button", { name: "Elimina intervento 9" })[0]);
        const dialog = await screen.findByRole("dialog", { name: "Elimina intervento" });
        await userEvent.type(within(dialog).getByRole("textbox"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => expect(api.deleteIntervention).toHaveBeenCalledWith(9));
        // Le ore usate cambiano: si ricarica anche il contratto, non solo la lista.
        await waitFor(() => expect(api.getContract.mock.calls.length).toBeGreaterThan(contractLoads));
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

    it("mostra pacchetto, ore, prezzo, priorità e tipologia", async () => {
        api.getContract.mockResolvedValue(contract());
        await renderPage();

        const details = screen.getByRole("heading", { name: "Dettagli" }).closest("[data-slot=card]") as HTMLElement;
        expect(within(details).getByText("Assistenza Remota Pack 20")).toBeInTheDocument();
        expect(within(details).getByText("20 ore al mese")).toBeInTheDocument();
        expect(within(details).getByText(/^400,00\s€ al mese \+ IVA$/)).toBeInTheDocument();
        expect(within(details).getByText("4")).toBeInTheDocument();
        expect(within(details).getByText("Teleassistenza, solo software")).toBeInTheDocument();
    });

    it("per il Supporto mostra le ore del contratto e lo storico con il totale progressivo", async () => {
        api.getContract.mockResolvedValue(
            contract({
                termMonths: 12,
                assistance: supportBase,
                hours: { period: "contract", month: null, usedHours: 30, includedHours: 80, remainingHours: 50 },
                monthlyHours: [
                    { month: "2026-08", usedHours: 10 },
                    { month: "2026-10", usedHours: 12 },
                    { month: "2026-09", usedHours: 8 },
                ],
            })
        );
        await renderPage();

        const details = screen.getByRole("heading", { name: "Dettagli" }).closest("[data-slot=card]") as HTMLElement;
        expect(within(details).getByText("80 ore in 12 mesi")).toBeInTheDocument();
        expect(within(details).getByText(/^1\.600,00\s€ \+ IVA$/)).toBeInTheDocument();
        expect(within(details).getByText("2")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Ore del contratto" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Ore del mese" })).not.toBeInTheDocument();
        expect(screen.getByText("30 h di 80 h (38%)")).toBeInTheDocument();

        const history = screen.getByRole("heading", { name: "Storico mensile" }).closest("[data-slot=card]");
        const headers = within(history as HTMLElement)
            .getAllByRole("columnheader")
            .map((header) => header.textContent);
        expect(headers).toEqual(["Mese", "Ore usate nel mese", "Totale progressivo"]);
        // Dal mese più recente; il totale parte dal più vecchio.
        const rows = within(history as HTMLElement).getAllByRole("row");
        expect(rows[1]).toHaveTextContent(/ottobre 2026/i);
        expect(rows[1]).toHaveTextContent("12 h");
        expect(rows[1]).toHaveTextContent("30 h");
        expect(rows[2]).toHaveTextContent("18 h");
        expect(rows[3]).toHaveTextContent("10 h");
        expect(rows[1]).not.toHaveTextContent("%");
    });

    it("un noleggio non ha ore né interventi", async () => {
        api.getContract.mockResolvedValue(contract({ type: "rental", assistance: null }));
        await renderPage();

        expect(screen.queryByRole("heading", { name: "Ore del mese" })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Interventi collegati" })).not.toBeInTheDocument();
        expect(api.listInterventions).not.toHaveBeenCalled();
    });

    describe("contratto firmato", () => {
        const signedContract = {
            fileName: "Contratto Rossi firmato.pdf",
            sizeBytes: 250 * 1024,
            uploadedAt: "2026-11-12T09:30:00.000Z",
        };

        it("senza firmato invita a caricarlo e non offre l'invio al cliente", async () => {
            api.getContract.mockResolvedValue(contract());
            await renderPage();

            expect(screen.getByRole("heading", { name: "Contratto firmato" })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Carica PDF firmato" })).toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: "Invia il contratto firmato al cliente" })
            ).not.toBeInTheDocument();
        });

        it("carica il PDF scelto e ricarica la scheda", async () => {
            api.getContract.mockResolvedValueOnce(contract());
            api.getContract.mockResolvedValue(contract({ signedContract }));
            api.uploadSignedContract.mockResolvedValue(signedContract);
            await renderPage();

            const file = new File(["%PDF-1.7"], "firmato.pdf", { type: "application/pdf" });
            await userEvent.upload(screen.getByLabelText("File del contratto firmato"), file);

            await waitFor(() => expect(api.uploadSignedContract).toHaveBeenCalledWith(21, file));
            expect(await screen.findByText("Contratto Rossi firmato.pdf")).toBeInTheDocument();
            expect(toast.success).toHaveBeenCalledWith("Contratto firmato caricato");
        });

        it("rifiuta un file che non è un PDF senza chiamare il server", async () => {
            api.getContract.mockResolvedValue(contract());
            await renderPage();

            const file = new File(["ciao"], "foto.jpg", { type: "image/jpeg" });
            fireEvent.change(screen.getByLabelText("File del contratto firmato"), { target: { files: [file] } });

            expect(toast.error).toHaveBeenCalledWith("Il contratto firmato deve essere un file PDF");
            expect(api.uploadSignedContract).not.toHaveBeenCalled();
        });

        it("con il firmato mostra il file, lo apre e lo invia al cliente dopo la conferma", async () => {
            api.getContract.mockResolvedValue(contract({ signedContract }));
            api.sendContractEmail.mockResolvedValue({ message: "Contratto firmato inviato a mario@example.com" });
            await renderPage();

            expect(screen.getByText("Contratto Rossi firmato.pdf")).toBeInTheDocument();
            expect(screen.getByText(/250 KB/)).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Apri" }));
            expect(openPrintWindow).toHaveBeenCalledWith("/api/contracts/21/signed-contract");

            await userEvent.click(screen.getByRole("button", { name: "Invia il contratto firmato al cliente" }));
            const dialog = screen.getByRole("dialog", { name: "Invia contratto firmato" });
            await userEvent.click(within(dialog).getByRole("button", { name: "Invia" }));

            await waitFor(() => expect(api.sendContractEmail).toHaveBeenCalledWith(21));
            expect(toast.success).toHaveBeenCalledWith("Contratto firmato inviato a mario@example.com");
        });

        it("elimina il firmato dopo la conferma", async () => {
            api.getContract.mockResolvedValueOnce(contract({ signedContract }));
            api.getContract.mockResolvedValue(contract());
            api.deleteSignedContract.mockResolvedValue({ message: "ok" });
            await renderPage();

            await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
            const dialog = screen.getByRole("dialog", { name: "Elimina contratto firmato" });
            await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

            await waitFor(() => expect(api.deleteSignedContract).toHaveBeenCalledWith(21));
            expect(await screen.findByRole("button", { name: "Carica PDF firmato" })).toBeInTheDocument();
        });
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

    const provider = {
        id: 8,
        providerName: "Rossi Informatica",
        firstName: "Anna",
        lastName: "Verdi",
        email: "info@rossi.it",
        phoneNumber: "081 123",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: null,
    };

    it("i contratti hanno le azioni di riga, ed eliminarne uno ricarica contratti e fornitore", async () => {
        api.getProvider.mockResolvedValue(provider);
        api.deleteContract.mockResolvedValue(undefined);
        renderWithProviders(<ProviderPage />, { route: "/providers/8", path: "/providers/:id" });

        for (const action of ["Modifica", "Stampa", "Elimina"]) {
            expect((await screen.findAllByRole("button", { name: `${action} contratto 21` })).length).toBeGreaterThan(
                0
            );
        }
        await userEvent.click(screen.getAllByRole("button", { name: "Stampa contratto 21" })[0]);
        expect(openPrintWindow).toHaveBeenCalledWith("/api/contracts/21/print");

        const providerLoads = api.getProvider.mock.calls.length;
        const contractLoads = api.listContracts.mock.calls.length;
        await userEvent.click(screen.getAllByRole("button", { name: "Elimina contratto 21" })[0]);
        const dialog = await screen.findByRole("dialog", { name: "Elimina contratto" });
        await userEvent.type(within(dialog).getByRole("textbox"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => expect(api.deleteContract).toHaveBeenCalledWith(21));
        await waitFor(() => expect(api.listContracts.mock.calls.length).toBeGreaterThan(contractLoads));
        await waitFor(() => expect(api.getProvider.mock.calls.length).toBeGreaterThan(providerLoads));
    });

    it("Stampa apre il PDF di tutti i contratti del fornitore", async () => {
        api.getProvider.mockResolvedValue(provider);
        renderWithProviders(<ProviderPage />, { route: "/providers/8", path: "/providers/:id" });

        await userEvent.click(await screen.findByRole("button", { name: "Stampa i contratti del fornitore" }));

        expect(openPrintWindow).toHaveBeenCalledWith("/api/providers/8/contracts/print");
    });
});
