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
    const renderDialog = async (props: { initialDate?: string } = {}) => {
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
                customer: "Mario Rossi - 333",
                customerId: 30,
                collaboratorId: 40,
                interventionDate: "2026-10-05",
                startTime: null,
                endTime: null,
            });
        });
        expect(toastSuccess).toHaveBeenCalledWith("Intervento creato con successo");
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

    it("segna come facoltativi i campi di un intervento solo programmato", async () => {
        await renderDialog();

        await chooseOption("Tipo intervento", "Intervento da remoto");

        // `\s*`: il calcolo del nome accessibile di jsdom perde lo spazio in testa allo span.
        expect(screen.getByLabelText(/^Ora inizio/)).toHaveAccessibleName(/^Ora inizio\s*\(facoltativa\)$/);
        expect(screen.getByLabelText(/^Assistenza effettuata/)).toHaveAccessibleName(
            /^Assistenza effettuata\s*\(facoltativo\)$/
        );

        await chooseOption("Stato", "In lavorazione");

        expect(screen.getByLabelText(/^Ora inizio/)).toHaveAccessibleName("Ora inizio(obbligatorio)");
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
});

describe("EditInterventionDialog", () => {
    const intervention = {
        id: 9,
        type: "intervento_sede",
        description: "Sostituito cavo",
        problem: "Rete assente",
        note: null,
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

        // Riportato a programmato, l'assistenza torna facoltativa.
        await chooseOption("Stato", "Programmato");
        await save();

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ status: "programmato", description: null })
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
