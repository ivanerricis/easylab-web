import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
const listProviders = vi.fn();
const createCustomer = vi.fn();
const createProvider = vi.fn();
const listContractPackages = vi.fn();
const listCustomerDevices = vi.fn();
const createCustomerDevice = vi.fn();
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
        listContractPackages: (...args: unknown[]) => listContractPackages(...args),
        listCustomerDevices: (...args: unknown[]) => listCustomerDevices(...args),
        createCustomerDevice: (...args: unknown[]) => createCustomerDevice(...args),
    };
});

// jsdom non ha un canvas: la riduzione del logo si prova a parte, qui basta che consegni un data URL.
vi.mock("@/lib/logoImage", () => ({
    logoFileToDataUrl: () => Promise.resolve("data:image/png;base64,AAA="),
}));

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import CreateContractDialog from "./createContractDialog";
import CreateProviderDialog from "./createProviderDialog";
import { renderWithProviders } from "@/test/render";
import type { ContractDto, ContractPackageDto } from "@/types/dtos";

// Moduli lunghi con menu di Radix e ricerca con debounce: vedi reportDialogs.test.tsx.
vi.setConfig({ testTimeout: 20000 });

const pageOf = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 8, totalPages: 1 });

const hardwareTypology = "Teleassistenza, on site e in laboratorio: hardware, software, formazione";

/** Il listino come lo serve il backend, nel suo ordine. */
const packagesList: ContractPackageDto[] = [
    {
        key: "remote_20",
        name: "Assistenza Remota Pack 20",
        includedHours: 20,
        priceCents: 40000,
        period: "month",
        priority: 4,
        typology: "Teleassistenza, solo software",
    },
    {
        key: "remote_40",
        name: "Assistenza Remota Pack 40",
        includedHours: 40,
        priceCents: 72000,
        period: "month",
        priority: 4,
        typology: "Teleassistenza, solo software",
    },
    {
        key: "ready_20",
        name: "Pronti Via 20",
        includedHours: 20,
        priceCents: 50000,
        period: "month",
        priority: 3,
        typology: hardwareTypology,
    },
    {
        key: "ready_40",
        name: "Pronti Via 40",
        includedHours: 40,
        priceCents: 90000,
        period: "month",
        priority: 3,
        typology: hardwareTypology,
    },
    {
        key: "ready_60",
        name: "Pronti Via 60",
        includedHours: 60,
        priceCents: 123000,
        period: "month",
        priority: 3,
        typology: hardwareTypology,
    },
    {
        key: "support_base",
        name: "Supporto Base",
        includedHours: 80,
        priceCents: 160000,
        period: "contract",
        priority: 2,
        typology: hardwareTypology,
    },
    {
        key: "support_plus",
        name: "Supporto Plus",
        includedHours: 150,
        priceCents: 250000,
        period: "contract",
        priority: 1,
        typology: hardwareTypology,
    },
];

const clientDevices = [
    { id: 5, type: "server", name: "Server NAS", serialNumber: "SN-1", model: null, note: null, customerId: 30 },
    { id: 6, type: "firewall", name: "Firewall", serialNumber: "FW-1", model: "Fortigate", note: null, customerId: 30 },
];

const chooseOption = async (label: string | RegExp, option: string | RegExp) => {
    await userEvent.click(screen.getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
};

const save = () => userEvent.click(screen.getByRole("button", { name: "Salva" }));

/** Sceglie il logo del fornitore: l'input dei file è nascosto, dietro il pulsante. */
const chooseLogo = async (container: HTMLElement) => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    await userEvent.upload(input as HTMLInputElement, new File(["x"], "logo.png", { type: "image/png" }));
};

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
    listContractPackages.mockResolvedValue(packagesList);
    // Mario Rossi (id 30) ha due dispositivi; il cliente del contratto in modifica (id 3) gli stessi due.
    listCustomerDevices.mockImplementation(async ({ customerId }: { customerId: number }) =>
        pageOf(customerId === 30 || customerId === 3 ? clientDevices : [])
    );
});

describe("CreateProviderDialog", () => {
    it("segnala nome, email e telefono mancanti insieme, col focus sul primo", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateProviderDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await save();

        expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
            "Il nome del fornitore non può essere vuoto",
            "L'email non può essere vuota",
            "Il telefono non può essere vuoto",
            "Il logo è obbligatorio",
        ]);
        expect(screen.getByLabelText(/^Nome fornitore/)).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("rifiuta un'email non valida e consegna i valori compilati", async () => {
        const onSubmit = vi.fn();
        const { baseElement } = renderWithProviders(
            <CreateProviderDialog open onOpenChange={() => {}} onSubmit={onSubmit} />
        );

        await userEvent.type(screen.getByLabelText(/^Nome fornitore/), "Rossi Informatica");
        await userEvent.type(screen.getByLabelText(/^Email/), "non-valida");
        await userEvent.type(screen.getByLabelText(/^Telefono/), "081 123");
        await save();
        expect(screen.getByText("Indirizzo email non valido")).toBeInTheDocument();

        await userEvent.clear(screen.getByLabelText(/^Email/));
        await userEvent.type(screen.getByLabelText(/^Email/), "info@rossi.it");
        await save();
        expect(await screen.findByText("Il logo è obbligatorio")).toBeInTheDocument();

        await chooseLogo(baseElement);
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                providerName: "Rossi Informatica",
                firstName: "",
                lastName: "",
                email: "info@rossi.it",
                phoneNumber: "081 123",
                logoDataUrl: "data:image/png;base64,AAA=",
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
        ]);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("la durata si sceglie fra quelle proposte o si scrive a mano", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await fillParties();
        await chooseOption("Durata", /^Altro/);

        const months = screen.getByRole("spinbutton", { name: /^Durata/ });
        await userEvent.clear(months);
        await userEvent.type(months, "18");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ termMonths: 18, billingMonths: null }));
        });
    });

    it("la durata a mano deve essere un numero di mesi da 1 a 120", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await fillParties();
        await chooseOption("Durata", /^Altro/);
        await userEvent.clear(screen.getByRole("spinbutton", { name: /^Durata/ }));
        await save();

        expect(await screen.findByText("Indica un numero di mesi da 1 a 120")).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("il noleggio ha il periodo di fatturazione, di 3 mesi se non si cambia", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        expect(screen.queryByRole("combobox", { name: /^Periodo di fatturazione/ })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("radio", { name: "Noleggio" }));
        expect(screen.getByRole("combobox", { name: /^Periodo di fatturazione/ })).toHaveTextContent("3 mesi");

        await fillParties();
        await chooseOption(/^Periodo di fatturazione/, /^Altro/);
        const billing = screen.getByRole("spinbutton", { name: /^Periodo di fatturazione/ });
        await userEvent.clear(billing);
        await userEvent.type(billing, "2");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ type: "rental", termMonths: 12, billingMonths: 2, assistance: null })
            );
        });
    });

    it("mostra quando scade e che documento ne uscirà", async () => {
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);

        expect(screen.getByText(/^Scade il/)).toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/);
        expect(screen.getByText("Contratto")).toBeInTheDocument();

        await chooseOption("Stato", "Bozza");
        expect(screen.getByText("Preventivo (bozza)")).toBeInTheDocument();
    });

    describe("dispositivi coperti", () => {
        it("la scelta è spenta finché non c'è un cliente, poi elenca i suoi dispositivi", async () => {
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);

            expect(screen.getByText("Seleziona prima un cliente.")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Nuovo dispositivo" })).toBeDisabled();

            await fillParties();

            expect(await screen.findByRole("checkbox", { name: "Server NAS – Server – S/N SN-1" })).not.toBeChecked();
            expect(screen.getByRole("checkbox", { name: "Firewall – Firewall – S/N FW-1" })).toBeInTheDocument();
            expect(listCustomerDevices).toHaveBeenCalledWith(expect.objectContaining({ customerId: 30 }));
            expect(screen.getByRole("button", { name: "Nuovo dispositivo" })).toBeEnabled();
        });

        it("è facoltativa: si salva anche senza dispositivi, e consegna quelli spuntati", async () => {
            const onSubmit = vi.fn();
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

            await fillParties();
            await userEvent.click(await screen.findByRole("checkbox", { name: /Server NAS/ }));
            await userEvent.click(screen.getByRole("checkbox", { name: /Firewall/ }));
            await save();

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ customerId: 30, deviceIds: [5, 6] }));
            });
        });

        it("cambiando cliente la scelta riparte: i dispositivi dell'altro cliente non restano selezionati", async () => {
            const onSubmit = vi.fn();
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

            await fillParties();
            await userEvent.click(await screen.findByRole("checkbox", { name: /Server NAS/ }));
            // Un secondo cliente, senza dispositivi.
            listCustomers.mockResolvedValue(
                pageOf([
                    {
                        id: 31,
                        firstName: "Luca",
                        lastName: "Verdi",
                        phoneNumber: "444",
                        phoneNumberSecondary: null,
                        email: null,
                        city: null,
                    },
                ])
            );
            await userEvent.clear(screen.getByLabelText(/^Cliente/));
            await userEvent.type(screen.getByLabelText(/^Cliente/), "luca");
            await userEvent.click(await screen.findByRole("option", { name: "Luca Verdi - 444" }, { timeout: 10_000 }));

            expect(await screen.findByText("Il cliente non ha ancora dispositivi.")).toBeInTheDocument();
            await save();

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ customerId: 31, deviceIds: [] }));
            });
        });

        it("«Nuovo dispositivo» ne crea uno per il cliente scelto e lo seleziona", async () => {
            const onSubmit = vi.fn();
            createCustomerDevice.mockResolvedValue({
                id: 9,
                type: "copier",
                name: "Ricoh sala",
                serialNumber: "R-9",
                model: null,
                note: null,
                customerId: 30,
            });
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

            await fillParties();
            await screen.findByRole("checkbox", { name: /Server NAS/ });
            await userEvent.click(screen.getByRole("button", { name: "Nuovo dispositivo" }));

            const dialog = await screen.findByRole("dialog", { name: "Nuovo dispositivo" });
            await userEvent.type(within(dialog).getByLabelText(/^Nome/), "Ricoh sala");
            await userEvent.click(within(dialog).getByRole("combobox", { name: /^Tipo/ }));
            await userEvent.click(await screen.findByRole("option", { name: "Fotocopiatrice" }));
            await userEvent.type(within(dialog).getByLabelText(/^Numero di serie/), "R-9");
            await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

            await waitFor(() => {
                expect(createCustomerDevice).toHaveBeenCalledWith({
                    type: "copier",
                    name: "Ricoh sala",
                    serialNumber: "R-9",
                    model: null,
                    note: null,
                    customerId: 30,
                });
            });
            expect(await screen.findByRole("checkbox", { name: /Ricoh sala/ })).toBeChecked();

            await save();
            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ deviceIds: [9] }));
            });
        });
    });

    describe("su telefono, a passi", () => {
        const desktopWidth = window.innerWidth;

        beforeEach(() => {
            window.innerWidth = 390;
            return () => {
                window.innerWidth = desktopWidth;
            };
        });

        it("procede un passo alla volta, controlla il passo e chiude con il riepilogo", async () => {
            const onSubmit = vi.fn();
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

            expect(screen.getByText("Passo 1 di 4:")).toBeInTheDocument();
            expect(screen.queryByRole("combobox", { name: "Stato" })).not.toBeInTheDocument();

            // "Avanti" controlla solo i campi del primo passo.
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            expect(await screen.findByText("Seleziona un cliente")).toBeInTheDocument();
            expect(screen.getByText("Passo 1 di 4:")).toBeInTheDocument();

            await fillParties();
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));

            expect(await screen.findByText("Passo 2 di 4:")).toBeInTheDocument();
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            expect(await screen.findByText("Passo 3 di 4:")).toBeInTheDocument();
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));

            // L'ultimo passo riassume quello che si sta per salvare, e "Salva" sta solo lì.
            expect(await screen.findByText("Passo 4 di 4:")).toBeInTheDocument();
            expect(screen.getByText("Mario Rossi - 333")).toBeInTheDocument();
            await userEvent.click(screen.getByRole("button", { name: "Salva" }));

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ customerId: 30, providerId: 8 }));
            });
        });

        it("«Indietro» torna al passo prima senza perdere quello che c'è", async () => {
            renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);

            await fillParties();
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            await screen.findByText("Passo 2 di 4:");
            await userEvent.click(screen.getByRole("button", { name: "Indietro" }));

            expect(await screen.findByText("Passo 1 di 4:")).toBeInTheDocument();
            expect(screen.getByLabelText(/^Cliente/)).toHaveValue("Mario Rossi - 333");
        });
    });

    it("carica il listino dal server e lo offre nel menu Pacchetto, con i dettagli del selezionato", async () => {
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByRole("combobox", { name: "Pacchetto" })).toHaveTextContent("Assistenza Remota Pack 20");
        });
        expect(listContractPackages).toHaveBeenCalledTimes(1);
        // Il primo del listino è già scelto: ore, prezzo, priorità e tipologia stanno sotto il menu.
        expect(screen.getByText(/^20 ore al mese · 400,00\s€ al mese \+ IVA$/)).toBeInTheDocument();
        expect(screen.getByText("Priorità d'intervento: 4")).toBeInTheDocument();
        expect(screen.getByText("Teleassistenza, solo software")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("combobox", { name: "Pacchetto" }));
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(
            packagesList.map((item) => item.name)
        );
        await userEvent.click(screen.getByRole("option", { name: "Supporto Plus" }));

        expect(screen.getByText(/^150 ore in 12 mesi · 2\.500,00\s€ \+ IVA$/)).toBeInTheDocument();
        expect(screen.getByText("Priorità d'intervento: 1 (massima)")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("radio", { name: "Noleggio" }));
        expect(screen.queryByRole("combobox", { name: "Pacchetto" })).not.toBeInTheDocument();
    });

    it("se il listino non si carica lo dice e permette di riprovare", async () => {
        listContractPackages.mockRejectedValueOnce(new Error("Server non raggiungibile"));
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);

        expect(await screen.findByText("Impossibile caricare i pacchetti.")).toBeInTheDocument();
        expect(toastError).toHaveBeenCalledWith("Server non raggiungibile");

        await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

        await waitFor(() => {
            expect(screen.getByRole("combobox", { name: "Pacchetto" })).toHaveTextContent("Assistenza Remota Pack 20");
        });
        expect(listContractPackages).toHaveBeenCalledTimes(2);
    });

    it("il Supporto porta la durata a 12 mesi e la blocca, un pacchetto mensile la sblocca", async () => {
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />);
        await screen.findByText("Priorità d'intervento: 4");

        await chooseOption("Durata", "6 mesi");
        expect(screen.getByRole("combobox", { name: "Durata" })).toHaveTextContent("6 mesi");

        await chooseOption("Pacchetto", "Supporto Base");

        expect(screen.getByRole("combobox", { name: "Durata" })).toHaveTextContent("12 mesi");
        expect(screen.getByRole("combobox", { name: "Durata" })).toBeDisabled();
        expect(screen.getByText("Il Supporto dura sempre 12 mesi")).toBeInTheDocument();

        await chooseOption("Pacchetto", "Pronti Via 40");

        expect(screen.getByRole("combobox", { name: "Durata" })).toBeEnabled();
        expect(screen.queryByText("Il Supporto dura sempre 12 mesi")).not.toBeInTheDocument();
        await chooseOption("Durata", "3 mesi");
        expect(screen.getByRole("combobox", { name: "Durata" })).toHaveTextContent("3 mesi");
    });

    it("consegna cliente e fornitore come id, col solo pacchetto scelto", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await fillParties();
        await chooseOption("Pacchetto", "Pronti Via 60");
        await chooseOption("Durata", "6 mesi");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "assistance",
                    termMonths: 6,
                    billingMonths: null,
                    deviceIds: [],
                    customerId: 30,
                    providerId: 8,
                    assistance: { package: "ready_60" },
                })
            );
        });
    });

    it("con il Supporto consegna 12 mesi", async () => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await fillParties();
        await chooseOption("Durata", "3 mesi");
        await chooseOption("Pacchetto", "Supporto Plus");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ termMonths: 12, assistance: { package: "support_plus" } })
            );
        });
    });

    it("il rifiuto del server sulla durata compare sotto il campo, non in un toast", async () => {
        const onSubmit = vi.fn().mockRejectedValue(
            Object.assign(new Error("Request failed"), {
                isAxiosError: true,
                response: {
                    status: 400,
                    data: { message: "Il pacchetto Supporto dura sempre 12 mesi", field: "termMonths" },
                },
            })
        );
        renderWithProviders(<CreateContractDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

        await fillParties();
        await save();

        expect(await screen.findByText("Il pacchetto Supporto dura sempre 12 mesi")).toBeInTheDocument();
        expect(toastError).not.toHaveBeenCalled();
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
            await chooseLogo(dialog);
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
            termMonths: 12,
            billingMonths: null,
            devices: [
                { id: 5, type: "server", name: "Server NAS", serialNumber: "SN-1", model: null },
                { id: 6, type: "firewall", name: "Firewall", serialNumber: "FW-1", model: null },
            ],
            note: null,
            startDate: "2026-06-01",
            endDate: "2027-06-01",
            customerId: 3,
            customerName: "Mario Rossi",
            providerId: 8,
            providerName: "Rossi Informatica",
            assistance: {
                package: "ready_40",
                name: "Pronti Via 40",
                includedHours: 40,
                priceCents: 90000,
                period: "month",
                priority: 3,
                typology: hardwareTypology,
            },
            signedContract: null,
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
        expect(screen.getByRole("radio", { name: "Assistenza" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Noleggio" })).toBeDisabled();
        expect(screen.getByLabelText(/^Cliente/)).toHaveValue("Mario Rossi");
        await waitFor(() => {
            expect(screen.getByRole("combobox", { name: "Pacchetto" })).toHaveTextContent("Pronti Via 40");
        });

        // I dispositivi collegati partono selezionati; togliendone uno, il salvataggio consegna l'altro.
        const serverNas = await screen.findByRole("checkbox", { name: /Server NAS/ });
        expect(serverNas).toBeChecked();
        expect(screen.getByRole("checkbox", { name: /Firewall/ })).toBeChecked();
        await userEvent.click(serverNas);
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ deviceIds: [6], customerId: 3, providerId: 8 })
            );
        });
        expect(toastSuccess).toHaveBeenCalledWith("Contratto aggiornato con successo");
    });
});
