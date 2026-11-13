import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const listInterventions = vi.fn();
const createIntervention = vi.fn();
const updateIntervention = vi.fn();
const deleteIntervention = vi.fn();
const sendInterventionEmail = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        listInterventions: (...args: unknown[]) => listInterventions(...args),
        createIntervention: (...args: unknown[]) => createIntervention(...args),
        updateIntervention: (...args: unknown[]) => updateIntervention(...args),
        deleteIntervention: (...args: unknown[]) => deleteIntervention(...args),
        sendInterventionEmail: (...args: unknown[]) => sendInterventionEmail(...args),
        getInterventionPrintUrl: (id: number) => `/api/interventions/${id}/print`,
    };
});

const resolveCustomerId = vi.fn();

vi.mock("@/lib/customerLookup", () => ({
    resolveCustomerId: (...args: unknown[]) => resolveCustomerId(...args),
}));

const openPrintWindow = vi.fn();

vi.mock("@/lib/utils", async () => {
    const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
    return { ...actual, openPrintWindow: (...args: unknown[]) => openPrintWindow(...args) };
});

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

// I dialoghi hanno i loro test: qui consegnano i valori scelti dal test (vedi ReportsPage.test).
let submitValues: unknown;
let submitError: unknown;

const DialogStub = ({
    open,
    label,
    onSubmit,
}: {
    open: boolean;
    label: string;
    onSubmit: (v: unknown) => Promise<void>;
}) =>
    open ? (
        <button
            onClick={() =>
                void onSubmit(submitValues).catch((error: unknown) => {
                    submitError = error;
                })
            }
        >
            {label}
        </button>
    ) : null;

vi.mock("@/components/dialogs/create/createInterventionDialog", () => ({
    default: (props: { open: boolean; onSubmit: (v: unknown) => Promise<void> }) => (
        <DialogStub {...props} label="Invia creazione" />
    ),
}));

vi.mock("@/components/dialogs/edit/editInterventionDialog", () => ({
    default: (props: { open: boolean; onSubmit: (v: unknown) => Promise<void> }) => (
        <DialogStub {...props} label="Invia modifica" />
    ),
}));

import InterventionsPage from "./InterventionsPage";
import { renderWithProviders } from "@/test/render";

const intervention = {
    id: 9,
    type: "customer_site",
    description: "Sostituito cavo",
    status: "scheduled",
    interventionDate: "2026-09-10",
    startTime: "09:00:00",
    endTime: null,
    customerId: 30,
    collaboratorId: 40,
    customer: "Mario Rossi",
    customerPhone: "333",
    collaborator: "Luca Bianchi",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: null,
};

const formValues = {
    type: "customer_site",
    status: "scheduled",
    description: null,
    problem: "Rete assente",
    note: "Citofonare al secondo piano",
    collaboratorId: 40,
    interventionDate: "2026-09-12",
    startTime: null,
    endTime: null,
};

const table = () => screen.getByRole("table");

const renderPage = async (route = "/interventions") => {
    renderWithProviders(<InterventionsPage />, { route });
    await within(table()).findByText("Mario Rossi");
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    submitError = undefined;
    listInterventions.mockResolvedValue({ items: [intervention], totalItems: 1, page: 1, pageSize: 10, totalPages: 1 });
});

describe("InterventionsPage", () => {
    it("mostra tutti gli stati di default e legge il filtro dall'indirizzo", async () => {
        await renderPage("/interventions?status=in_progress");

        expect(listInterventions).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress" }));
    });

    it("un link salvato con i vecchi valori italiani filtra come prima", async () => {
        await renderPage("/interventions?status=in_lavorazione&type=intervento_sede");

        expect(listInterventions).toHaveBeenCalledWith(
            expect.objectContaining({ status: "in_progress", type: "customer_site" })
        );
    });

    it("senza filtro nell'indirizzo chiede tutti gli stati", async () => {
        await renderPage();

        expect(listInterventions).toHaveBeenCalledWith(expect.objectContaining({ status: "all", type: "all" }));
    });

    /** La nota era raccolta dal dialogo e poi scartata dalla pagina: ora deve arrivare all'API. */
    it("crea l'intervento passando anche la nota, e offre di aprirlo o stamparlo", async () => {
        resolveCustomerId.mockResolvedValue(30);
        createIntervention.mockResolvedValue({ id: 77 });
        submitValues = { ...formValues, customer: "Mario Rossi - 333", customerId: null };
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo intervento" }));
        await userEvent.click(await screen.findByRole("button", { name: "Invia creazione" }));

        await waitFor(() => {
            expect(toastSuccess).toHaveBeenCalledWith("Intervento #77 creato", expect.any(Object));
        });
        expect(resolveCustomerId).toHaveBeenCalledWith(null, "Mario Rossi - 333");
        expect(createIntervention).toHaveBeenCalledWith({ ...formValues, customerId: 30 });
        // Niente stampa finché non la si chiede dall'avviso.
        expect(openPrintWindow).not.toHaveBeenCalled();

        const options = toastSuccess.mock.calls[0][1] as {
            action: { label: string; onClick: () => void };
            cancel: { label: string; onClick: () => void };
        };
        expect(options.action.label).toBe("Stampa");
        expect(options.cancel.label).toBe("Apri");
        options.action.onClick();
        options.cancel.onClick();
        expect(openPrintWindow).toHaveBeenCalledWith("/api/interventions/77/print");
        expect(navigate).toHaveBeenCalledWith("/interventions/77");
    });

    it("lascia al dialogo l'errore di creazione, senza mostrarlo una seconda volta", async () => {
        resolveCustomerId.mockRejectedValue(new Error("Seleziona un cliente esistente o creane uno nuovo."));
        submitValues = { ...formValues, customer: "Nessuno", customerId: null };
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo intervento" }));
        await userEvent.click(await screen.findByRole("button", { name: "Invia creazione" }));

        await waitFor(() => {
            expect(submitError).toBeInstanceOf(Error);
        });
        expect(toastError).not.toHaveBeenCalled();
        expect(createIntervention).not.toHaveBeenCalled();
    });

    /** Dall'elenco la nota modificata andava persa: solo la scheda la mandava. */
    it("modifica l'intervento dall'elenco passando anche la nota", async () => {
        updateIntervention.mockResolvedValue({});
        submitValues = { ...formValues, interventionId: 9 };
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Modifica intervento 9" }));
        await userEvent.click(await screen.findByRole("button", { name: "Invia modifica" }));

        await waitFor(() => {
            expect(updateIntervention).toHaveBeenCalledWith(9, formValues);
        });
        await waitFor(() => {
            expect(listInterventions).toHaveBeenCalledTimes(2);
        });
    });

    it("invia l'email dopo la conferma e mostra la risposta del server", async () => {
        sendInterventionEmail.mockResolvedValue({ message: "Email inviata a mario@example.com" });
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Invia email intervento 9" }));
        const dialog = screen.getByRole("dialog", { name: "Invia email intervento" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Invia" }));

        await waitFor(() => {
            expect(toastSuccess).toHaveBeenCalledWith("Email inviata a mario@example.com");
        });
        expect(sendInterventionEmail).toHaveBeenCalledWith(9);
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("se l'email non parte lo dice e lascia riprovare", async () => {
        sendInterventionEmail.mockRejectedValue(new Error("Il cliente non ha un indirizzo email"));
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Invia email intervento 9" }));
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Invia" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Il cliente non ha un indirizzo email");
        });
        expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Invia" })).toBeEnabled();
    });

    it("apre la scheda, stampa ed elimina dalla riga", async () => {
        deleteIntervention.mockResolvedValue({});
        await renderPage();

        // Niente più pulsante "Apri": la riga si apre con Invio (e col doppio clic).
        expect(within(table()).queryByRole("link", { name: /^Apri / })).not.toBeInTheDocument();
        fireEvent.keyDown(within(table()).getAllByRole("row")[1], { key: "Enter" });
        expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/interventions\/\d+$/));
        await userEvent.click(within(table()).getByRole("button", { name: "Stampa intervento 9" }));
        expect(openPrintWindow).toHaveBeenCalledWith("/api/interventions/9/print");

        await userEvent.click(within(table()).getByRole("button", { name: "Elimina intervento 9" }));
        const dialog = screen.getByRole("dialog", { name: "Elimina intervento" });
        await userEvent.type(within(dialog).getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(deleteIntervention).toHaveBeenCalledWith(9);
        });
        expect(toastSuccess).toHaveBeenCalledWith("Intervento eliminato con successo");
    });

    /** Filtri, ordinamento, ricerca e pagina stanno nell'indirizzo: un link li riapre tali e quali. */
    it("legge ordinamento, date, ricerca e pagina dall'indirizzo", async () => {
        await renderPage("/interventions?sort=customer:asc&from=2026-09-01&to=2026-09-30&q=rossi&page=2&type=remote");

        expect(listInterventions).toHaveBeenCalledWith(
            expect.objectContaining({
                sortBy: "customer",
                sortOrder: "asc",
                dateFrom: "2026-09-01",
                dateTo: "2026-09-30",
                search: "rossi",
                page: 2,
                type: "remote",
            })
        );
    });

    it("ignora nell'indirizzo i valori che non riconosce e riparte dai predefiniti", async () => {
        await renderPage("/interventions?status=boh&type=xx&sort=nonsense:asc&from=ieri&to=2026-9-1&page=-3");

        expect(listInterventions).toHaveBeenCalledWith(
            expect.objectContaining({
                status: "all",
                type: "all",
                sortBy: "createdAt",
                sortOrder: "desc",
                dateFrom: undefined,
                dateTo: undefined,
                page: 1,
            })
        );
    });

    it("con filtri attivi e nessun risultato lo dice, senza proporre di crearne uno", async () => {
        listInterventions.mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 10, totalPages: 0 });
        renderWithProviders(<InterventionsPage />, { route: "/interventions?status=completed" });

        expect(await within(table()).findByText("Nessun intervento corrisponde ai filtri.")).toBeInTheDocument();
    });

    it("senza filtri né ricerca e nessun risultato mostra l'elenco vuoto", async () => {
        listInterventions.mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 10, totalPages: 0 });
        renderWithProviders(<InterventionsPage />);

        expect(await within(table()).findByText("Nessun intervento disponibile.")).toBeInTheDocument();
    });

    it("se il caricamento fallisce mostra l'errore e Riprova ricarica", async () => {
        listInterventions.mockRejectedValueOnce(new Error("Server non raggiungibile"));
        renderWithProviders(<InterventionsPage />);

        expect(await within(table()).findByText("Impossibile caricare gli interventi.")).toBeInTheDocument();
        expect(toastError).toHaveBeenCalledWith("Server non raggiungibile");
        expect(within(table()).queryByText("Mario Rossi")).not.toBeInTheDocument();

        await userEvent.click(within(table()).getByRole("button", { name: "Riprova" }));

        expect(await within(table()).findByText("Mario Rossi")).toBeInTheDocument();
        expect(listInterventions).toHaveBeenCalledTimes(2);
    });

    it("se l'eliminazione fallisce lo dice e l'intervento resta in elenco", async () => {
        deleteIntervention.mockRejectedValue(new Error("Intervento fatturato"));
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Elimina intervento 9" }));
        const dialog = screen.getByRole("dialog", { name: "Elimina intervento" });
        await userEvent.type(within(dialog).getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Intervento fatturato");
        });
        // Il dialogo resta aperto per riprovare, e rende inaccessibile il resto: si cerca per testo.
        expect(screen.getByRole("dialog", { name: "Elimina intervento" })).toBeInTheDocument();
        expect(screen.getAllByText("Mario Rossi").length).toBeGreaterThan(0);
        expect(toastSuccess).not.toHaveBeenCalled();
    });

    /** Scegliere un filtro lo scrive nell'indirizzo e rifà la richiesta; tornare a "tutti" lo toglie. */
    it("cambia stato, tipo e ordinamento dai filtri e li toglie tornando ai predefiniti", async () => {
        await renderPage();
        const choose = async (label: string, option: string) => {
            await userEvent.click(screen.getByRole("combobox", { name: label }));
            await userEvent.click(await screen.findByRole("option", { name: option }));
        };

        await choose("Filtra per stato", "Completato");
        await waitFor(() => {
            expect(listInterventions).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
        });

        await choose("Filtra per tipo", "Intervento da remoto");
        await waitFor(() => {
            expect(listInterventions).toHaveBeenLastCalledWith(
                expect.objectContaining({ status: "completed", type: "remote" })
            );
        });

        await choose("Ordina per", "Cliente (A-Z)");
        await waitFor(() => {
            expect(listInterventions).toHaveBeenLastCalledWith(
                expect.objectContaining({ sortBy: "customer", sortOrder: "asc" })
            );
        });

        await choose("Ordina per", "Più recenti");
        await choose("Filtra per stato", "Tutti gli stati");
        await choose("Filtra per tipo", "Tutti i tipi");
        await waitFor(() => {
            expect(listInterventions).toHaveBeenLastCalledWith(
                expect.objectContaining({ status: "all", type: "all", sortBy: "createdAt", sortOrder: "desc" })
            );
        });
    });

    it("la ricerca riparte dalla prima pagina e filtra per il testo scritto", async () => {
        await renderPage("/interventions?page=2");

        await userEvent.type(screen.getByRole("searchbox"), "rossi");

        await waitFor(() => {
            expect(listInterventions).toHaveBeenLastCalledWith(expect.objectContaining({ search: "rossi", page: 1 }));
        });
    });
});
