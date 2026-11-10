import type { ComponentProps } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listCollaborators = vi.fn();
const listCustomers = vi.fn();
const getIntervention = vi.fn();
const listContracts = vi.fn();
const getContract = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        listCollaborators: (...args: unknown[]) => listCollaborators(...args),
        listCustomers: (...args: unknown[]) => listCustomers(...args),
        getIntervention: (...args: unknown[]) => getIntervention(...args),
        listContracts: (...args: unknown[]) => listContracts(...args),
        getContract: (...args: unknown[]) => getContract(...args),
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

const chooseOption = async (label: string | RegExp, option: string | RegExp) => {
    await userEvent.click(screen.getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
};

/** I campi orario sono `TimeField`: si scrive l'orario e si esce dal campo, che lo conferma. */
const setTime = (label: RegExp, value: string) => {
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
};

/** Il riquadro tinto di destra: stato, prezzo, pagamento e fatturazione (vedi `InterventionProgressSection`). */
const progressPanel = () => {
    const panel = screen.getByRole("heading", { name: "Stato e pagamento" }).closest("section");
    expect(panel).not.toBeNull();
    return within(panel as HTMLElement);
};

const save = () => userEvent.click(screen.getByRole("button", { name: "Salva" }));

beforeEach(() => {
    vi.clearAllMocks();
    listContracts.mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 200, totalPages: 1 });
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
        // Dieci secondi e non il secondo di default: vedi `pickSuggestion` in `reportDialogs.test.tsx`.
        await userEvent.click(await screen.findByRole("option", { name: "Mario Rossi - 333" }, { timeout: 10_000 }));
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

    it('da desktop tiene stato, prezzo, pagamento e fatturazione nel riquadro "Stato e pagamento"', async () => {
        await renderDialog();

        const panel = progressPanel();
        expect(panel.getByRole("combobox", { name: "Stato" })).toBeInTheDocument();
        expect(panel.getByLabelText(/^Prezzo/)).toBeInTheDocument();
        expect(panel.getByRole("radiogroup", { name: "Pagamento" })).toBeInTheDocument();
        expect(panel.getByRole("radiogroup", { name: "Fatturazione" })).toBeInTheDocument();
        // Il resto sta nell'altra colonna: il riquadro non ha né il tipo né il collaboratore.
        expect(panel.queryByRole("combobox", { name: "Tipo intervento" })).not.toBeInTheDocument();
        expect(panel.queryByRole("combobox", { name: /^Collaboratore/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
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
                type: "material_delivery",
                status: "scheduled",
                description: null,
                problem: null,
                note: null,
                price: null,
                paid: false,
                toInvoice: false,
                customer: "Mario Rossi - 333",
                customerId: 30,
                collaboratorId: 40,
                contractId: null,
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
                    type: "customer_site",
                    status: "completed",
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
                expect.objectContaining({ type: "material_delivery", problem: null, startTime: null, endTime: null })
            );
        });
    });

    /** Su telefono il modulo diventa a quattro passi (vedi `interventionSteps`). */
    // Fra i test più lunghi: sotto carico i 20 secondi di default del file non bastavano.
    describe("su telefono, a passi", { timeout: 60_000 }, () => {
        const desktopWidth = window.innerWidth;

        beforeEach(() => {
            window.innerWidth = 390;
            return () => {
                window.innerWidth = desktopWidth;
            };
        });

        it("mostra una parte alla volta e salva all'ultimo passo", async () => {
            const onSubmit = await renderDialog({ initialDate: "2026-10-05" });

            expect(screen.getByText("Passo 1 di 2:")).toBeInTheDocument();
            expect(screen.queryByRole("combobox", { name: "Tipo intervento" })).not.toBeInTheDocument();

            // "Avanti" controlla solo cliente e collaboratore, i campi del primo passo.
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
                "Seleziona un cliente",
                "Seleziona un collaboratore",
            ]);

            await fillCustomerAndCollaborator();
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
            // Il cliente è stato scelto dai suggerimenti, quindi l'id c'è già e "Avanti" non lo
            // verifica sul server (quel percorso ha i suoi test, sotto).
            expect(await screen.findByRole("combobox", { name: "Tipo intervento" })).toBeInTheDocument();
            expect(screen.getByLabelText(/^Note/)).toBeInTheDocument();
            expect(screen.getByRole("combobox", { name: "Stato" })).toBeInTheDocument();
            expect(screen.getByRole("radiogroup", { name: "Pagamento" })).toBeInTheDocument();
            expect(screen.getByRole("radiogroup", { name: "Fatturazione" })).toBeInTheDocument();
            // Su telefono stato e pagamento stanno nella sezione, non nel riquadro di destra.
            expect(screen.queryByRole("heading", { name: "Stato e pagamento" })).not.toBeInTheDocument();

            await userEvent.type(screen.getByLabelText(/^Prezzo/), "45");
            await userEvent.click(screen.getByRole("button", { name: "Salva" }));

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalled();
            });
            expect(onSubmit.mock.calls[0][0]).toMatchObject({
                customer: "Mario Rossi - 333",
                customerId: 30,
                collaboratorId: 40,
                interventionDate: "2026-10-05",
                price: 45,
            });
        });

        it("un cliente che non esiste si ferma su Avanti, con l'errore sul campo", async () => {
            await renderDialog({ initialDate: "2026-10-05" });
            listCustomers.mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 8, totalPages: 0 });

            await userEvent.type(screen.getByLabelText(/^Cliente/), "Cliente Inventato");
            await chooseOption(/^Collaboratore/, "Luca Bianchi");
            await userEvent.click(screen.getByRole("button", { name: "Avanti" }));

            expect(await screen.findByRole("alert")).toHaveTextContent(
                "Seleziona un cliente esistente o creane uno nuovo."
            );
            expect(screen.getByText("Passo 1 di 2:")).toBeInTheDocument();
            expect(screen.getByLabelText(/^Cliente/)).toHaveFocus();
        });
    });
});

describe("EditInterventionDialog", () => {
    const intervention = {
        id: 9,
        type: "customer_site",
        description: "Sostituito cavo",
        problem: "Rete assente",
        note: null,
        price: null,
        paid: true,
        toInvoice: true,
        status: "completed",
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

    it('tiene stato, prezzo, pagamento e fatturazione nel riquadro "Stato e pagamento"', async () => {
        await renderDialog();

        const panel = progressPanel();
        expect(panel.getByRole("combobox", { name: "Stato" })).toHaveTextContent("Completato");
        expect(panel.getByLabelText(/^Prezzo/)).toBeInTheDocument();
        expect(panel.getByRole("radio", { name: "Pagato" })).toBeChecked();
        expect(panel.getByRole("radio", { name: "Da fatturare" })).toBeChecked();
        expect(panel.queryByLabelText(/^Problema/)).not.toBeInTheDocument();
    });

    it("salva le modifiche", async () => {
        const onSubmit = await renderDialog();

        await userEvent.type(screen.getByLabelText(/^Note/), "  Richiamare lunedì ");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({
                interventionId: 9,
                type: "customer_site",
                status: "completed",
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
                expect.objectContaining({ status: "in_progress", description: null })
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

/** Il menu "Contratto di assistenza": offre solo i contratti validi per cliente, data e tipo. */
describe("contratto di assistenza negli interventi", () => {
    const contract = (id: number, assistanceType: string, overrides: Record<string, unknown> = {}) => ({
        id,
        type: "assistance",
        status: "active",
        effectiveStatus: "active",
        termMonths: 12,
        billingMonths: null,
        device: `Dispositivo ${id}`,
        note: null,
        startDate: "2026-09-01",
        endDate: "2027-09-01",
        customerId: 30,
        customerName: "Mario Rossi",
        providerId: 8,
        providerName: "Rossi Informatica",
        assistance: { assistanceType, includedHours: assistanceType === "full_time" ? null : 10 },
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: null,
        ...overrides,
    });

    const pageOf = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 200, totalPages: 1 });

    beforeEach(() => {
        listContracts.mockResolvedValue(
            pageOf([contract(1, "remote"), contract(2, "on_site"), contract(3, "remote", { startDate: "2026-11-01" })])
        );
    });

    const renderCreate = async () => {
        const onSubmit = vi.fn();
        renderWithProviders(
            <CreateInterventionDialog open onOpenChange={() => {}} onSubmit={onSubmit} initialDate="2026-10-05" />
        );
        await userEvent.type(screen.getByLabelText(/^Cliente/), "mario");
        await userEvent.click(await screen.findByRole("option", { name: "Mario Rossi - 333" }, { timeout: 10_000 }));
        await chooseOption(/^Collaboratore/, "Luca Bianchi");
        return onSubmit;
    };

    it("chiede al server i contratti attivi di assistenza del cliente e filtra per tipo e data", async () => {
        await renderCreate();
        await chooseOption("Tipo intervento", "Intervento da remoto");

        await waitFor(() => {
            expect(listContracts).toHaveBeenCalledWith(
                expect.objectContaining({ customerId: 30, type: "assistance", status: "active" })
            );
        });
        await userEvent.click(await screen.findByRole("combobox", { name: "Contratto di assistenza" }));
        // Il #2 è "in sede o in laboratorio": non consuma ore da remoto. Il #3 inizia dopo la data.
        expect(screen.getByRole("option", { name: /#1 Remota/ })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /#2/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /#3/ })).not.toBeInTheDocument();
    });

    it("un intervento in laboratorio vede il pacchetto in sede e lo invia come contractId", async () => {
        const onSubmit = await renderCreate();
        await chooseOption("Tipo intervento", "Intervento in laboratorio");
        await userEvent.type(screen.getByLabelText(/^Problema/), "Non si accende");
        await chooseOption("Contratto di assistenza", /#2 In sede/);
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "lab", contractId: 2 }));
        });
    });

    it("toglie il contratto scelto quando il tipo non lo consuma più e prende l'unico rimasto", async () => {
        const onSubmit = await renderCreate();
        await chooseOption("Tipo intervento", "Intervento in laboratorio");
        await userEvent.type(screen.getByLabelText(/^Problema/), "Non si accende");
        await chooseOption("Contratto di assistenza", /#2 In sede/);

        // Da remoto il #2 non vale più; l'unico valido è il #1, che si sceglie da solo.
        await chooseOption("Tipo intervento", "Intervento da remoto");
        await waitFor(() => {
            expect(screen.getByRole("combobox", { name: "Contratto di assistenza" })).toHaveTextContent("#1 Remota");
        });
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "remote", contractId: 1 }));
        });
    });

    it("con un solo contratto valido lo sceglie già, e non lo ripropone se si sceglie nessuno", async () => {
        const onSubmit = await renderCreate();
        await chooseOption("Tipo intervento", "Intervento da remoto");
        await userEvent.type(screen.getByLabelText(/^Problema/), "Rete");

        await waitFor(() => {
            expect(screen.getByRole("combobox", { name: "Contratto di assistenza" })).toHaveTextContent("#1 Remota");
        });

        await chooseOption("Contratto di assistenza", "Nessun contratto");
        expect(screen.getByRole("combobox", { name: "Contratto di assistenza" })).toHaveTextContent("Nessun contratto");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "remote", contractId: null }));
        });
    });

    it("con più contratti validi non ne sceglie nessuno", async () => {
        listContracts.mockResolvedValue(pageOf([contract(1, "remote"), contract(4, "remote")]));
        await renderCreate();
        await chooseOption("Tipo intervento", "Intervento da remoto");

        const select = await screen.findByRole("combobox", { name: "Contratto di assistenza" });
        expect(select).toHaveTextContent("Nessun contratto");
        await userEvent.click(select);
        expect(screen.getByRole("option", { name: /#1 Remota/ })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: /#4 Remota/ })).toBeInTheDocument();
    });

    it("senza contratti validi il menu non c'è", async () => {
        listContracts.mockResolvedValue(pageOf([]));
        await renderCreate();
        await chooseOption("Tipo intervento", "Intervento da remoto");

        await waitFor(() => {
            expect(listContracts).toHaveBeenCalled();
        });
        expect(screen.queryByRole("combobox", { name: "Contratto di assistenza" })).not.toBeInTheDocument();
    });

    it("in modifica tiene il contratto già collegato anche se scaduto e non lo rimanda se non cambia", async () => {
        getContract.mockResolvedValue(contract(5, "remote", { effectiveStatus: "expired", endDate: "2026-12-01" }));
        listContracts.mockResolvedValue(pageOf([]));
        getIntervention.mockResolvedValue({
            id: 9,
            type: "remote",
            description: "Fatto",
            problem: "Rete",
            note: null,
            price: null,
            paid: false,
            toInvoice: false,
            status: "completed",
            interventionDate: "2026-10-05",
            startTime: "09:00:00",
            endTime: "10:00:00",
            customerId: 30,
            collaboratorId: 40,
            contractId: 5,
            created_at: "2026-10-05T00:00:00.000Z",
            updated_at: null,
        });
        const onSubmit = vi.fn().mockResolvedValue(undefined);
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

        await waitFor(() => {
            expect(screen.getByRole("combobox", { name: "Contratto di assistenza" })).toHaveTextContent("#5 Remota");
        });
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalled();
        });
        expect(onSubmit.mock.calls[0][0].contractId).toBeUndefined();
    });

    it("in modifica non collega da solo un intervento salvato senza contratto", async () => {
        getIntervention.mockResolvedValue({
            id: 10,
            type: "remote",
            description: "Fatto",
            problem: "Rete",
            note: null,
            price: null,
            paid: false,
            toInvoice: false,
            status: "completed",
            interventionDate: "2026-10-05",
            startTime: "09:00:00",
            endTime: "10:00:00",
            customerId: 30,
            collaboratorId: 40,
            contractId: null,
            created_at: "2026-10-05T00:00:00.000Z",
            updated_at: null,
        });
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        renderWithProviders(
            <EditInterventionDialog
                open
                interventionId={10}
                customerName="Mario Rossi"
                onOpenChange={() => {}}
                onSubmit={onSubmit}
            />
        );

        // Il #1 è l'unico valido: il menu c'è, ma resta su "Nessun contratto".
        expect(
            await screen.findByRole("combobox", { name: "Contratto di assistenza" }, { timeout: 10_000 })
        ).toHaveTextContent("Nessun contratto");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalled();
        });
        expect(onSubmit.mock.calls[0][0].contractId).toBeUndefined();
    });

    it("se il cliente ha contratti ma nessuno copre la data, spiega perché non c'è il menu", async () => {
        listContracts.mockResolvedValue(pageOf([contract(3, "remote", { startDate: "2026-11-05" })]));
        await renderCreate();
        await chooseOption("Tipo intervento", "Intervento da remoto");

        expect(await screen.findByText(/Il contratto #3 vale dal 05\/11\/2026/)).toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Contratto di assistenza" })).not.toBeInTheDocument();
    });

    it("una consegna di materiale non ha il menu del contratto", async () => {
        await renderCreate();

        expect(screen.queryByRole("combobox", { name: "Contratto di assistenza" })).not.toBeInTheDocument();
    });
});
