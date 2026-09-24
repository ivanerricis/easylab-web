import type { ComponentProps } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listCollaborators = vi.fn();
const listCustomers = vi.fn();
const getIntervention = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        listCollaborators: (...args: unknown[]) => listCollaborators(...args),
        listCustomers: (...args: unknown[]) => listCustomers(...args),
        getIntervention: (...args: unknown[]) => getIntervention(...args),
        createCustomer: vi.fn(),
    };
});

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import CreateInterventionDialog from "./create/createInterventionDialog";
import EditInterventionDialog from "./edit/editInterventionDialog";
import { renderWithProviders } from "@/test/render";

// Moduli lunghi con menu di Radix e ricerca con debounce: vedi reportDialogs.test.tsx.
vi.setConfig({ testTimeout: 20000 });

const timestamps = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };

const chooseOption = async (label: string | RegExp, option: string) => {
    await userEvent.click(screen.getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
};

/** I campi orario sono `type="time"`: si impostano direttamente, come fa il selettore nativo. */
const setTime = (label: RegExp, value: string) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const save = () => userEvent.click(screen.getByRole("button", { name: "Salva" }));

beforeEach(() => {
    vi.clearAllMocks();
    listCollaborators.mockResolvedValue([
        { id: 40, firstName: "Luca", lastName: "Bianchi", phoneNumber: null, ...timestamps },
    ]);
    listCustomers.mockResolvedValue({
        items: [
            {
                id: 30,
                firstName: "Mario",
                lastName: "Rossi",
                phoneNumber: "333",
                phoneNumberSecondary: null,
                email: null,
                city: null,
                ...timestamps,
            },
        ],
        totalItems: 1,
        page: 1,
        pageSize: 8,
        totalPages: 1,
    });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("CreateInterventionDialog", () => {
    const renderDialog = async (props: Partial<ComponentProps<typeof CreateInterventionDialog>> = {}) => {
        const onSubmit = vi.fn();
        renderWithProviders(<CreateInterventionDialog open onOpenChange={() => {}} onSubmit={onSubmit} {...props} />);
        await waitFor(() => {
            expect(listCollaborators).toHaveBeenCalled();
        });
        return onSubmit;
    };

    const fillCustomerAndCollaborator = async () => {
        await userEvent.type(screen.getByLabelText(/^Cliente/), "mario");
        await userEvent.click(await screen.findByRole("button", { name: "Mario Rossi - 333" }));
        await chooseOption(/^Collaboratore/, "Luca Bianchi");
    };

    it("parte da una consegna programmata per oggi", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
        vi.setSystemTime(new Date(2026, 8, 11, 10, 0));
        await renderDialog();

        expect(screen.getByRole("combobox", { name: "Tipo intervento" })).toHaveTextContent("Consegna materiale");
        expect(screen.getByRole("combobox", { name: "Stato" })).toHaveTextContent("Programmato");
        expect(screen.getByRole("button", { name: /Data consegna/ })).toHaveTextContent("11/09/2026");
        // Una consegna non ha orari né problema.
        expect(screen.queryByLabelText(/^Ora inizio/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Problema")).not.toBeInTheDocument();
    });

    it("usa la data dello slot cliccato nel calendario", async () => {
        await renderDialog({ initialDate: "2026-10-05" });

        expect(screen.getByRole("button", { name: /Data consegna/ })).toHaveTextContent("05/10/2026");
    });

    it("segnala cliente e collaboratore mancanti insieme", async () => {
        const onSubmit = await renderDialog();

        await save();

        expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
            "Seleziona un cliente",
            "Seleziona un collaboratore",
        ]);
        expect(screen.getByLabelText(/^Cliente/)).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("consegna una consegna programmata senza descrizione né orari", async () => {
        const onSubmit = await renderDialog({ initialDate: "2026-10-05" });

        await fillCustomerAndCollaborator();
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                type: "consegna_materiale",
                status: "programmato",
                description: null,
                problem: null,
                note: null,
                price: null,
                paid: false,
                toInvoice: false,
                customer: "Mario Rossi - 333",
                customerId: 30,
                collaboratorId: 40,
                interventionDate: "2026-10-05",
                startTime: null,
                endTime: null,
            });
        });
        // L'avviso di creazione lo dà la pagina, con il numero e le azioni (`showCreatedToast`).
        expect(toastSuccess).not.toHaveBeenCalled();
    });

    /** Dalla scheda del cliente: la casella è già compilata e il cliente già risolto per id. */
    it("parte dal cliente passato, senza doverlo cercare", async () => {
        const onSubmit = await renderDialog({
            initialCustomer: {
                id: 77,
                firstName: "Anna",
                lastName: "Verdi",
                phoneNumber: null,
                phoneNumberSecondary: "081",
                email: null,
                city: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: null,
            },
        });

        expect(screen.getByLabelText(/^Cliente/)).toHaveValue("Anna Verdi - 081");

        // Q10: prima, dopo la pausa di battitura (250ms), partiva comunque una ricerca inutile
        // con l'etichetta già scritta, perché il campo non sapeva che il valore era già stato
        // scelto. Più della pausa: se una ricerca fosse partita sarebbe già stata chiamata.
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(listCustomers).not.toHaveBeenCalled();

        await chooseOption(/^Collaboratore/, "Luca Bianchi");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ customer: "Anna Verdi - 081", customerId: 77 })
            );
        });
    });

    it("il prezzo è facoltativo ma, se indicato, viaggia come numero", async () => {
        const onSubmit = await renderDialog({ initialDate: "2026-10-05" });

        await fillCustomerAndCollaborator();
        await userEvent.type(screen.getByLabelText(/^Prezzo/), "45");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ price: 45 }));
        });
    });

    it("rifiuta un prezzo negativo", async () => {
        const onSubmit = await renderDialog({ initialDate: "2026-10-05" });

        await fillCustomerAndCollaborator();
        await userEvent.type(screen.getByLabelText(/^Prezzo/), "-5");
        await save();

        expect(screen.getByLabelText(/^Prezzo/)).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    /** Un intervento chiuso deve dire cosa è stato fatto e quando. */
    it("a un intervento completato in sede chiede orari coerenti e assistenza", async () => {
        const onSubmit = await renderDialog({ initialDate: "2026-10-05" });

        await fillCustomerAndCollaborator();
        await chooseOption("Tipo intervento", "Intervento in sede");
        await chooseOption("Stato", "Completato");
        await userEvent.type(screen.getByLabelText(/^Problema/), "Stampante bloccata");
        setTime(/^Ora inizio/, "11:00");
        setTime(/^Ora fine/, "10:00");
        await save();

        expect(screen.getByRole("alert")).toHaveTextContent("Indica il tipo di assistenza effettuata");
        expect(screen.getByLabelText(/^Assistenza effettuata/)).toHaveFocus();

        await userEvent.type(screen.getByLabelText(/^Assistenza effettuata/), "Sbloccato il rullo");
        await save();

        expect(screen.getByRole("alert")).toHaveTextContent("L'ora di fine deve essere successiva all'ora di inizio");
        expect(onSubmit).not.toHaveBeenCalled();

        setTime(/^Ora fine/, "12:30");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "intervento_sede",
                    status: "completato",
                    problem: "Stampante bloccata",
                    description: "Sbloccato il rullo",
                    startTime: "11:00",
                    endTime: "12:30",
                })
            );
        });
    });

    it("mette l'asterisco a orari e assistenza solo a intervento completato", async () => {
        await renderDialog();

        await chooseOption("Tipo intervento", "Intervento da remoto");

        // Nessuna scritta "(facoltativo)": senza obbligo l'etichetta è il solo nome del campo.
        expect(screen.getByLabelText(/^Ora inizio/)).toHaveAccessibleName("Ora inizio");
        expect(screen.getByLabelText(/^Assistenza effettuata/)).toHaveAccessibleName("Assistenza effettuata");

        await chooseOption("Stato", "In lavorazione");

        expect(screen.getByLabelText(/^Ora inizio/)).toHaveAccessibleName("Ora inizio");
        expect(screen.getByLabelText(/^Assistenza effettuata/)).toHaveAccessibleName("Assistenza effettuata");

        await chooseOption("Stato", "Completato");

        expect(screen.getByLabelText(/^Ora inizio/)).toHaveAccessibleName("Ora inizio(obbligatorio)");
        expect(screen.getByLabelText(/^Assistenza effettuata/)).toHaveAccessibleName(
            "Assistenza effettuata(obbligatorio)"
        );
    });

    /** Tornando a una consegna gli orari già scritti non vanno spediti: non hanno senso. */
    it("non consegna orari e problema quando il tipo torna a consegna", async () => {
        const onSubmit = await renderDialog();

        await fillCustomerAndCollaborator();
        await chooseOption("Tipo intervento", "Intervento in sede");
        await userEvent.type(screen.getByLabelText(/^Problema/), "Rete lenta");
        setTime(/^Ora inizio/, "09:00");
        await chooseOption("Tipo intervento", "Consegna materiale");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ type: "consegna_materiale", problem: null, startTime: null, endTime: null })
            );
        });
    });

    /** Su telefono il modulo diventa a quattro passi (vedi `interventionSteps`). */
    describe("su telefono, a passi", () => {
        const desktopWidth = window.innerWidth;

        beforeEach(() => {
            window.innerWidth = 390;
            return () => {
                window.innerWidth = desktopWidth;
            };
        });

        it("mostra una parte alla volta e salva all'ultimo passo", async () => {
            const onSubmit = await renderDialog({ initialDate: "2026-10-05" });

            expect(screen.getByText("Passo 1 di 4:")).toBeInTheDocument();
            expect(screen.queryByRole("combobox", { name: "Tipo intervento" })).not.toBeInTheDocument();

            // "Avanti" controlla solo cliente e collaboratore, i campi del primo passo.
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
                "Seleziona un cliente",
                "Seleziona un collaboratore",
            ]);

            // Il cliente scritto a mano, non scelto dai suggerimenti: vedi lo stesso test in
            // `reportDialogs.test.tsx`.
            await userEvent.type(screen.getByLabelText(/^Cliente/), "Mario Rossi");
            await chooseOption(/^Collaboratore/, "Luca Bianchi");
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            expect(screen.getByRole("combobox", { name: "Tipo intervento" })).toBeInTheDocument();
            expect(screen.queryByLabelText(/^Prezzo/)).not.toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            expect(screen.getByLabelText(/^Note/)).toBeInTheDocument();
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));

            await userEvent.type(screen.getByLabelText(/^Prezzo/), "45");
            await userEvent.click(screen.getByRole("button", { name: "Salva" }));

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalled();
            });
            expect(onSubmit.mock.calls[0][0]).toMatchObject({
                customer: "Mario Rossi",
                customerId: null,
                collaboratorId: 40,
                interventionDate: "2026-10-05",
                price: 45,
            });
        });
    });
});

describe("EditInterventionDialog", () => {
    const intervention = {
        id: 9,
        type: "intervento_sede",
        description: "Sostituito cavo",
        problem: "Rete assente",
        note: null,
        price: null,
        paid: true,
        toInvoice: true,
        status: "completato",
        interventionDate: "2026-09-10",
        startTime: "09:00:00",
        endTime: "10:15:00",
        customerId: 30,
        collaboratorId: 40,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: null,
    };

    const renderDialog = async (onSubmit = vi.fn().mockResolvedValue(undefined)) => {
        renderWithProviders(
            <EditInterventionDialog
                open
                interventionId={9}
                customerName="Mario Rossi"
                onOpenChange={() => {}}
                onSubmit={onSubmit}
            />
        );
        await screen.findByLabelText(/^Problema/);
        return onSubmit;
    };

    beforeEach(() => {
        getIntervention.mockResolvedValue(intervention);
    });

    it("carica l'intervento, con gli orari senza secondi", async () => {
        await renderDialog();

        expect(getIntervention).toHaveBeenCalledWith(9);
        expect(screen.getByRole("dialog", { name: "Modifica intervento #9" })).toBeInTheDocument();
        expect(screen.getByLabelText(/^Ora inizio/)).toHaveValue("09:00");
        expect(screen.getByLabelText(/^Ora fine/)).toHaveValue("10:15");
        expect(screen.getByLabelText(/^Problema/)).toHaveValue("Rete assente");
        expect(screen.getByRole("combobox", { name: /^Collaboratore/ })).toHaveTextContent("Luca Bianchi");
    });

    it("salva le modifiche", async () => {
        const onSubmit = await renderDialog();

        await userEvent.type(screen.getByLabelText(/^Note/), "  Richiamare lunedì ");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                interventionId: 9,
                type: "intervento_sede",
                status: "completato",
                description: "Sostituito cavo",
                problem: "Rete assente",
                note: "Richiamare lunedì",
                price: null,
                paid: true,
                toInvoice: true,
                collaboratorId: 40,
                interventionDate: "2026-09-10",
                startTime: "09:00",
                endTime: "10:15",
            });
        });
        expect(toastSuccess).toHaveBeenCalledWith("Intervento aggiornato con successo");
    });

    it("applica le stesse regole della creazione", async () => {
        const onSubmit = await renderDialog();

        await userEvent.clear(screen.getByLabelText(/^Assistenza effettuata/));
        await save();

        expect(screen.getByRole("alert")).toHaveTextContent("Indica il tipo di assistenza effettuata");
        expect(onSubmit).not.toHaveBeenCalled();

        // Riportato in lavorazione, l'assistenza torna facoltativa.
        await chooseOption("Stato", "In lavorazione");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ status: "in_lavorazione", description: null })
            );
        });
    });

    it("chiude con un errore se l'intervento non si carica", async () => {
        getIntervention.mockRejectedValue(new Error("Intervento non trovato"));
        const onOpenChange = vi.fn();
        renderWithProviders(
            <EditInterventionDialog
                open
                interventionId={9}
                customerName=""
                onOpenChange={onOpenChange}
                onSubmit={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
        expect(toastError).toHaveBeenCalledWith("Intervento non trovato");
    });
});
