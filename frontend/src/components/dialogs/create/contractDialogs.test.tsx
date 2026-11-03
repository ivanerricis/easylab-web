import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
const listProviders = vi.fn();
const createCustomer = vi.fn();
const createProvider = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        listCustomers: (...args: unknown[]) => listCustomers(...args),
        listProviders: (...args: unknown[]) => listProviders(...args),
        createCustomer: (...args: unknown[]) => createCustomer(...args),
        createProvider: (...args: unknown[]) => createProvider(...args),
    };
});

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import CreateContractDialog from "./createContractDialog";
import CreateProviderDialog from "./createProviderDialog";
import { renderWithProviders } from "@/test/render";
import type { ContractDto } from "@/types/dtos";

// Moduli lunghi con menu di Radix e ricerca con debounce: vedi reportDialogs.test.tsx.
vi.setConfig({ testTimeout: 20000 });

const pageOf = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 8, totalPages: 1 });

const chooseOption = async (label: string | RegExp, option: string | RegExp) => {
    await userEvent.click(screen.getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
};

const save = () => userEvent.click(screen.getByRole("button", { name: "Salva" }));

beforeEach(() => {
    vi.clearAllMocks();
    listCustomers.mockResolvedValue(
        pageOf([
            {
                id: 30,
                firstName: "Mario",
                lastName: "Rossi",
                phoneNumber: "333",
                phoneNumberSecondary: null,
                email: null,
                city: null,
            },
        ])
    );
    listProviders.mockResolvedValue(pageOf([{ id: 8, providerName: "Rossi Informatica" }]));
});

describe("CreateProviderDialog", () => {
    it("segnala nome, email e telefono mancanti insieme, col focus sul primo", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateProviderDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await save();

        expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
            "Il nome del fornitore non puÃ² essere vuoto",
            "L'email non puÃ² essere vuota",
            "Il telefono non puÃ² essere vuoto",
        ]);
        expect(screen.getByLabelText(/^Nome fornitore/)).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("rifiuta un'email non valida e consegna i valori compilati", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateProviderDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await userEvent.type(screen.getByLabelText(/^Nome fornitore/), "Rossi Informatica");
        await userEvent.type(screen.getByLabelText(/^Email/), "non-valida");
        await userEvent.type(screen.getByLabelText(/^Telefono/), "081 123");
        await save();
        expect(screen.getByRole("alert")).toHaveTextContent("Indirizzo email non valido");

        await userEvent.clear(screen.getByLabelText(/^Email/));
        await userEvent.type(screen.getByLabelText(/^Email/), "info@rossi.it");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                providerName: "Rossi Informatica",
                firstName: "",
                lastName: "",
                email: "info@rossi.it",
                phoneNumber: "081 123",
            });
        });
        expect(toastSuccess).toHaveBeenCalledWith("Fornitore creato con successo");
    });
});

describe("CreateContractDialog", () => {
    const fillParties = async () => {
        await userEvent.type(screen.getByLabelText(/^Cliente/), "mario");
        await userEvent.click(await screen.findByRole("option", { name: "Mario Rossi - 333" }, { timeout: 10_000 }));
        await userEvent.type(screen.getByLabelText(/^Fornitore/), "rossi");
        await userEvent.click(await screen.findByRole("option", { name: "Rossi Informatica" }, { timeout: 10_000 }));
    };

    it("segnala i campi mancanti, ciascuno col suo messaggio", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await save();

        expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
            "Seleziona un cliente",
            "Seleziona un fornitore",
            "Indica il dispositivo",
        ]);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("offre solo le ore del pacchetto e le azzera cambiando pacchetto", async () => {
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);

        await userEvent.click(screen.getByRole("combobox", { name: /^Ore al mese/ }));
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["5 h", "10 h", "20 h"]);
        await userEvent.keyboard("{Escape}");

        await chooseOption("Pacchetto", "In sede o in laboratorio");
        expect(screen.getByRole("combobox", { name: /^Ore al mese/ })).toHaveTextContent("10 h");

        await chooseOption("Pacchetto", "Full time");
        expect(screen.queryByRole("combobox", { name: /^Ore al mese/ })).not.toBeInTheDocument();

        await chooseOption("Tipo", "Noleggio");
        expect(screen.queryByRole("combobox", { name: "Pacchetto" })).not.toBeInTheDocument();
    });

    it("consegna cliente e fornitore come id, col pacchetto scelto", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await fillParties();
        await userEvent.type(screen.getByLabelText(/^Dispositivo/), "Server NAS");
        await chooseOption("Pacchetto", "Remota");
        await chooseOption(/^Ore al mese/, "20 h");
        await chooseOption("Durata", "6 mesi");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "assistance",
                    term: "months_6",
                    device: "Server NAS",
                    customerId: 30,
                    providerId: 8,
                    assistance: { assistanceType: "remote", includedHours: 20 },
                })
            );
        });
    });

    describe("creazione al volo di cliente e fornitore", () => {
        const fillNewCustomer = async () => {
            await userEvent.click(screen.getByRole("button", { name: "Crea nuovo cliente" }));
            const dialog = await screen.findByRole("dialog", { name: "Nuovo cliente" });
            await userEvent.type(within(dialog).getByLabelText(/^Nome o azienda/), "Anna");
            await userEvent.type(within(dialog).getByLabelText(/^Cognome/), "Bianchi");
            await userEvent.type(within(dialog).getByLabelText(/^Telefono 1/), "340 111");
            await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));
            return dialog;
        };

        const fillNewProvider = async () => {
            await userEvent.click(screen.getByRole("button", { name: "Crea nuovo fornitore" }));
            const dialog = await screen.findByRole("dialog", { name: "Nuovo fornitore" });
            await userEvent.type(within(dialog).getByLabelText(/^Nome fornitore/), "Verdi Reti");
            await userEvent.type(within(dialog).getByLabelText(/^Email/), "info@verdi.it");
            await userEvent.type(within(dialog).getByLabelText(/^Telefono/), "081 999");
            await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));
            return dialog;
        };

        it("il cliente creato riempie la casella e si salva con il suo id, senza altre ricerche", async () => {
            createCustomer.mockResolvedValue({
                id: 77,
                firstName: "Anna",
                lastName: "Bianchi",
                phoneNumber: "340 111",
                phoneNumberSecondary: null,
            });
            const onSubmit = vi.fn();
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

            // L'errore del campo vuoto sparisce quando il cliente creato lo riempie.
            await save();
            expect(screen.getByText("Seleziona un cliente")).toBeInTheDocument();

            await fillNewCustomer();

            await waitFor(() => {
                expect(screen.queryByRole("dialog", { name: "Nuovo cliente" })).not.toBeInTheDocument();
            });
            expect(createCustomer).toHaveBeenCalledWith(
                expect.objectContaining({ firstName: "Anna", lastName: "Bianchi", phoneNumber: "340 111" })
            );
            expect(screen.getByLabelText(/^Cliente/)).toHaveValue("Anna Bianchi - 340 111");
            expect(screen.queryByText("Seleziona un cliente")).not.toBeInTheDocument();

            await userEvent.type(screen.getByLabelText(/^Fornitore/), "rossi");
            await userEvent.click(
                await screen.findByRole("option", { name: "Rossi Informatica" }, { timeout: 10_000 })
            );
            await userEvent.type(screen.getByLabelText(/^Dispositivo/), "Server NAS");
            listCustomers.mockClear();
            await save();

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ customerId: 77, providerId: 8 }));
            });
            expect(listCustomers).not.toHaveBeenCalled();
        });

        it("il fornitore creato riempie la casella e si salva con il suo id", async () => {
            createProvider.mockResolvedValue({ id: 55, providerName: "Verdi Reti" });
            const onSubmit = vi.fn();
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

            await fillNewProvider();

            await waitFor(() => {
                expect(screen.queryByRole("dialog", { name: "Nuovo fornitore" })).not.toBeInTheDocument();
            });
            expect(createProvider).toHaveBeenCalledWith(
                expect.objectContaining({ providerName: "Verdi Reti", email: "info@verdi.it", phoneNumber: "081 999" })
            );
            expect(screen.getByLabelText(/^Fornitore/)).toHaveValue("Verdi Reti");

            await userEvent.type(screen.getByLabelText(/^Cliente/), "mario");
            await userEvent.click(
                await screen.findByRole("option", { name: "Mario Rossi - 333" }, { timeout: 10_000 })
            );
            await userEvent.type(screen.getByLabelText(/^Dispositivo/), "Server NAS");
            listProviders.mockClear();
            await save();

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ customerId: 30, providerId: 55 }));
            });
            expect(listProviders).not.toHaveBeenCalled();
        });

        it("se la creazione fallisce il dialogo annidato resta aperto e il campo non cambia", async () => {
            createCustomer.mockRejectedValue(new Error("Telefono già in uso"));
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);

            const dialog = await fillNewCustomer();

            await waitFor(() => {
                expect(toastError).toHaveBeenCalledWith("Telefono già in uso");
            });
            expect(dialog).toBeInTheDocument();
            expect(screen.getByLabelText(/^Cliente/)).toHaveValue("");
        });
    });

    it("in modifica il tipo non si cambia e i campi partono dal contratto", async () => {
        const contract: ContractDto = {
            id: 21,
            type: "assistance",
            status: "active",
            effectiveStatus: "active",
            term: "months_12",
            device: "Server NAS",
            note: null,
            startDate: "2026-06-01",
            endDate: "2027-06-01",
            customerId: 3,
            customerName: "Mario Rossi",
            providerId: 8,
            providerName: "Rossi Informatica",
            assistance: { assistanceType: "complete", includedHours: 100 },
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: null,
        };
        const onSubmit = vi.fn();
        renderWithProviders(
            <CreateContractDialog
                open
                onOpenChange={() => {}}
                onSubmit={onSubmit}
                mode="edit"
                initialValues={contract}
            />
        );

        expect(await screen.findByRole("dialog", { name: "Modifica contratto #21" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Tipo" })).toBeDisabled();
        expect(screen.getByLabelText(/^Cliente/)).toHaveValue("Mario Rossi");
        expect(screen.getByRole("combobox", { name: "Pacchetto" })).toHaveTextContent("Completa");
        await waitFor(() => {
            expect(screen.getByRole("combobox", { name: /^Ore al mese/ })).toHaveTextContent("100 h");
        });

        await userEvent.clear(screen.getByLabelText(/^Dispositivo/));
        await userEvent.type(screen.getByLabelText(/^Dispositivo/), "Firewall");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ device: "Firewall", customerId: 3, providerId: 8 })
            );
        });
        expect(toastSuccess).toHaveBeenCalledWith("Contratto aggiornato con successo");
    });
});
