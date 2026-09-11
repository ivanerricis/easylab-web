import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listDevices = vi.fn();
const listIssues = vi.fn();
const listCustomers = vi.fn();
const listCollaborators = vi.fn();
const listTechnicians = vi.fn();
const getReport = vi.fn();
const createIssue = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        listDevices: (...args: unknown[]) => listDevices(...args),
        listIssues: (...args: unknown[]) => listIssues(...args),
        listCustomers: (...args: unknown[]) => listCustomers(...args),
        listCollaborators: (...args: unknown[]) => listCollaborators(...args),
        listTechnicians: (...args: unknown[]) => listTechnicians(...args),
        getReport: (...args: unknown[]) => getReport(...args),
        createIssue: (...args: unknown[]) => createIssue(...args),
        createDevice: vi.fn(),
        createCustomer: vi.fn(),
    };
});

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import CreateReportDialog from "./create/createReportDialog";
import EditReportDialog from "./edit/editReportDialog";
import { renderWithProviders } from "@/test/render";

/**
 * Questi test compilano per davvero un modulo da dieci campi, con i menu di Radix e la ricerca
 * clienti che aspetta la pausa di battitura: i 5 secondi di default non bastano. Un test che
 * scade è peggio di uno lento, perché la sua funzione continua a girare e i suoi tasti finiscono
 * nel DOM del test successivo, facendolo fallire per un motivo che non è suo.
 */
vi.setConfig({ testTimeout: 20000 });

const timestamps = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };

const devices = [
    { id: 10, name: "Notebook", ...timestamps },
    { id: 11, name: "Smartphone", ...timestamps },
];

const issues = [
    { id: 20, description: "Schermo rotto", ...timestamps },
    { id: 21, description: "Altro", ...timestamps },
];

const customers = [
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
];

/** Sceglie un'opzione di un Select di Radix: il trigger è un combobox con l'etichetta del campo. */
const chooseOption = async (label: string | RegExp, option: string) => {
    await userEvent.click(screen.getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
};

/** Scrive in un campo con suggerimenti e clicca quello indicato. */
const pickSuggestion = async (field: HTMLElement, text: string, suggestion: string) => {
    await userEvent.type(field, text);
    await userEvent.click(await screen.findByRole("button", { name: suggestion }));
};

beforeEach(() => {
    vi.clearAllMocks();
    listDevices.mockResolvedValue(devices);
    listIssues.mockResolvedValue(issues);
    listCustomers.mockResolvedValue({ items: customers, totalItems: 1, page: 1, pageSize: 8, totalPages: 1 });
    listCollaborators.mockResolvedValue([
        { id: 40, firstName: "Luca", lastName: "Bianchi", phoneNumber: null, ...timestamps },
    ]);
    listTechnicians.mockResolvedValue([
        { id: 50, firstName: "Paolo", lastName: null, phoneNumber: null, vatNumber: null, ...timestamps },
    ]);
});

describe("CreateReportDialog", () => {
    const renderDialog = (onSubmit = vi.fn()) => {
        renderWithProviders(<CreateReportDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);
        return onSubmit;
    };

    it("segnala tutti i campi obbligatori in una volta, con il focus sul primo", async () => {
        const onSubmit = renderDialog();
        await waitFor(() => {
            expect(listIssues).toHaveBeenCalled();
        });

        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
            "Seleziona un cliente",
            "Seleziona un dispositivo",
            "Seleziona un difetto",
            "Seleziona se l'alimentatore è presente",
            "Seleziona se deve essere effettuato il backup dati",
        ]);
        expect(screen.getByLabelText("Cliente")).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    /** La casella del difetto serve a cercare nel catalogo, non a inventare voci nuove. */
    it("rifiuta un difetto che non è nel catalogo", async () => {
        renderDialog();
        await waitFor(() => {
            expect(listIssues).toHaveBeenCalled();
        });

        await userEvent.type(screen.getByLabelText("Difetto"), "Tastiera bagnata");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(screen.getByText(/Seleziona un difetto esistente, oppure creane uno nuovo/)).toBeInTheDocument();
    });

    it("consegna gli id risolti dai cataloghi, senza descrizione per un difetto normale", async () => {
        const onSubmit = renderDialog();
        await waitFor(() => {
            expect(listIssues).toHaveBeenCalled();
        });

        await pickSuggestion(screen.getByLabelText("Cliente"), "mario", "Mario Rossi - 333");
        await pickSuggestion(screen.getByLabelText("Tipologia dispositivo"), "note", "Notebook");
        await pickSuggestion(screen.getByLabelText("Difetto"), "schermo", "Schermo rotto");
        expect(screen.queryByLabelText("Problema riscontrato")).not.toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Password sblocco"), "1234");
        await chooseOption("Alimentatore presente", "Si");
        await chooseOption("Backup dati", "No");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalled();
        });
        expect(onSubmit.mock.calls[0][0]).toMatchObject({
            customer: "Mario Rossi - 333",
            customerId: 30,
            deviceId: 10,
            issueId: 20,
            issueDescription: null,
            password: "1234",
            charger: true,
            dataBackup: false,
        });
        expect(listCustomers).toHaveBeenCalledWith({ pageSize: 8, search: "mario" });
        expect(toastSuccess).toHaveBeenCalledWith("Report creato con successo");
    });

    /**
     * Con "Altro" l'etichetta del catalogo non dice niente al cliente: sulla ricevuta va il
     * problema scritto qui, che quindi diventa obbligatorio.
     */
    it("con il difetto 'Altro' pretende e consegna il problema scritto a mano", async () => {
        const onSubmit = renderDialog();
        await waitFor(() => {
            expect(listIssues).toHaveBeenCalled();
        });

        await pickSuggestion(screen.getByLabelText("Cliente"), "mario", "Mario Rossi - 333");
        await pickSuggestion(screen.getByLabelText("Tipologia dispositivo"), "smart", "Smartphone");
        await pickSuggestion(screen.getByLabelText("Difetto"), "alt", "Altro");
        await chooseOption("Alimentatore presente", "No");
        await chooseOption("Backup dati", "Si");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(screen.getByRole("alert")).toHaveTextContent('Con il difetto "Altro" va descritto il problema');
        expect(onSubmit).not.toHaveBeenCalled();

        await userEvent.type(screen.getByLabelText("Problema riscontrato"), "  Non carica la batteria  ");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalled();
        });
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ issueId: 21, issueDescription: "Non carica la batteria" });
    });

    it("lascia al chiamante cliente e dispositivo scritti a mano, senza id", async () => {
        const onSubmit = renderDialog();
        await waitFor(() => {
            expect(listIssues).toHaveBeenCalled();
        });

        await userEvent.type(screen.getByLabelText("Cliente"), "Mario Rossi");
        await userEvent.type(screen.getByLabelText("Tipologia dispositivo"), "Tablet");
        await pickSuggestion(screen.getByLabelText("Difetto"), "schermo", "Schermo rotto");
        await chooseOption("Alimentatore presente", "No");
        await chooseOption("Backup dati", "No");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalled();
        });
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ customer: "Mario Rossi", customerId: null, deviceId: null });
    });

    it("crea al volo un difetto nuovo e lo rende subito selezionabile", async () => {
        createIssue.mockResolvedValue({ id: 22, description: "Tastiera bagnata", ...timestamps });
        renderDialog();
        await waitFor(() => {
            expect(listIssues).toHaveBeenCalled();
        });

        await pickSuggestion(screen.getByLabelText("Difetto"), "Tastiera bagnata", 'Crea "Tastiera bagnata"');

        expect(createIssue).toHaveBeenCalledWith({ description: "Tastiera bagnata" });
        expect(screen.getByLabelText("Difetto")).toHaveValue("Tastiera bagnata");
    });
});

describe("EditReportDialog", () => {
    const report = {
        id: 7,
        customerId: 30,
        deviceId: 10,
        issueId: 20,
        collaboratorId: null,
        technicianId: 50,
        technicianPrice: 25,
        note: null,
        password: "0000",
        issueDescription: null,
        serviceDescription: null,
        dataBackup: false,
        charger: true,
        alerted: false,
        closed: false,
        price: 80,
        paymentMethod: "cash",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: null,
    };

    const renderDialog = async (onSubmit = vi.fn().mockResolvedValue(undefined), onOpenChange = vi.fn()) => {
        renderWithProviders(
            <EditReportDialog
                open
                reportId={7}
                customerName="Mario Rossi"
                onOpenChange={onOpenChange}
                onSubmit={onSubmit}
            />
        );
        await screen.findByLabelText("Password sblocco");
        return onSubmit;
    };

    beforeEach(() => {
        getReport.mockResolvedValue(report);
    });

    it("carica il report e ne mostra i valori", async () => {
        await renderDialog();

        expect(getReport).toHaveBeenCalledWith(7);
        expect(screen.getByRole("dialog", { name: "Modifica report #7" })).toBeInTheDocument();
        expect(screen.getByLabelText("Password sblocco")).toHaveValue("0000");
        expect(screen.getByRole("combobox", { name: "Dispositivo" })).toHaveTextContent("Notebook");
        expect(screen.getByRole("combobox", { name: "Tecnico" })).toHaveTextContent("Paolo");
        expect(screen.getByLabelText("Prezzo interno")).toHaveValue(80);
        expect(screen.getByRole("radio", { name: "Contanti" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Alimentatore presente" })).toBeChecked();
    });

    it("chiude con un errore se il report non si carica", async () => {
        getReport.mockRejectedValue(new Error("Report non trovato"));
        const onOpenChange = vi.fn();
        renderWithProviders(
            <EditReportDialog open reportId={7} customerName="" onOpenChange={onOpenChange} onSubmit={vi.fn()} />
        );

        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
        expect(toastError).toHaveBeenCalledWith("Report non trovato");
    });

    it("consegna i valori, con i campi di testo vuoti come null", async () => {
        const onSubmit = await renderDialog();

        await userEvent.type(screen.getByLabelText("Descrizione intervento"), "  Sostituito display  ");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalled();
        });
        expect(onSubmit.mock.calls[0][0]).toEqual({
            reportId: 7,
            customerId: 30,
            deviceId: 10,
            issueId: 20,
            collaboratorId: null,
            technicianId: 50,
            existingTechnicianId: 50,
            technicianPrice: 25,
            issueDescription: null,
            serviceDescription: "Sostituito display",
            note: null,
            password: "0000",
            paymentMethod: "cash",
            dataBackup: false,
            charger: true,
            alerted: false,
            closed: false,
            internalPrice: 80,
        });
    });

    /** Un report chiuso senza collaboratore non direbbe chi l'ha lavorato. */
    it("non chiude un report senza collaboratore", async () => {
        const onSubmit = await renderDialog();

        await userEvent.click(screen.getByRole("checkbox", { name: "Report chiuso" }));
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Per chiudere un report è necessario selezionare un collaboratore"
        );
        expect(onSubmit).not.toHaveBeenCalled();

        await chooseOption("Collaboratore", "Luca Bianchi");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ closed: true, collaboratorId: 40 }));
        });
    });

    it("con contanti o carta non accetta un prezzo a zero", async () => {
        const onSubmit = await renderDialog();

        await userEvent.clear(screen.getByLabelText("Prezzo interno"));
        await userEvent.type(screen.getByLabelText("Prezzo interno"), "0");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0"
        );
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("'Non pagato' riporta il prezzo a zero", async () => {
        const onSubmit = await renderDialog();

        await userEvent.click(screen.getByRole("radio", { name: "Non pagato" }));

        expect(screen.getByLabelText("Prezzo interno")).toHaveValue(0);

        await userEvent.click(screen.getByRole("button", { name: "Salva" }));
        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ paymentMethod: "non_paid", internalPrice: 0 })
            );
        });
    });

    it("rifiuta prezzi negativi", async () => {
        const onSubmit = await renderDialog();

        await userEvent.clear(screen.getByLabelText("Prezzo lavoro tecnico"));
        await userEvent.type(screen.getByLabelText("Prezzo lavoro tecnico"), "-5");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Il prezzo del tecnico deve essere maggiore o uguale a zero"
        );
        expect(screen.getByLabelText("Prezzo lavoro tecnico")).toHaveFocus();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("passando ad 'Altro' chiede il problema e lo consegna", async () => {
        const onSubmit = await renderDialog();

        await chooseOption("Difetto catalogo", "Altro");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));
        expect(screen.getByRole("alert")).toHaveTextContent('Con il difetto "Altro" va descritto il problema');

        await userEvent.type(screen.getByLabelText("Problema riscontrato"), "Ventola rumorosa");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({ issueId: 21, issueDescription: "Ventola rumorosa" })
            );
        });
    });

    /**
     * Tornando a un difetto normale il problema scritto a mano va azzerato: altrimenti la
     * ricevuta stamperebbe una descrizione rimasta da una scelta precedente.
     */
    it("azzera il problema scritto quando il difetto non è più 'Altro'", async () => {
        getReport.mockResolvedValue({ ...report, issueId: 21, issueDescription: "Ventola rumorosa" });
        const onSubmit = await renderDialog();
        expect(screen.getByLabelText("Problema riscontrato")).toHaveValue("Ventola rumorosa");

        await chooseOption("Difetto catalogo", "Schermo rotto");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ issueId: 20, issueDescription: null }));
        });
    });

    it("se il salvataggio fallisce resta aperto con l'errore", async () => {
        const onOpenChange = vi.fn();
        await renderDialog(vi.fn().mockRejectedValue(new Error("Conflitto")), onOpenChange);

        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Conflitto");
        });
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Salva" })).toBeEnabled();
    });
});
