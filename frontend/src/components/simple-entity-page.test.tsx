import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listDevices = vi.fn();
const createDevice = vi.fn();
const updateDevice = vi.fn();
const deleteDevice = vi.fn();
const listIssues = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        listDevices: (...args: unknown[]) => listDevices(...args),
        createDevice: (...args: unknown[]) => createDevice(...args),
        updateDevice: (...args: unknown[]) => updateDevice(...args),
        deleteDevice: (...args: unknown[]) => deleteDevice(...args),
        listIssues: (...args: unknown[]) => listIssues(...args),
        createIssue: vi.fn(),
        updateIssue: vi.fn(),
        deleteIssue: vi.fn(),
    };
});

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
    },
}));

import DevicesPage from "@/pages/devices/DevicesPage";
import { renderWithProviders } from "@/test/render";
import IssuesPage from "@/pages/issues/IssuesPage";

const page = <T,>(items: T[]) => ({ items, totalItems: items.length, page: 1, pageSize: 10, totalPages: 1 });

const devices = [
    { id: 1, name: "Notebook", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
    { id: 2, name: "Smartphone", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: null },
];

/** Tabella e schede sono entrambe nel DOM (le alterna il CSS): si lavora sulla tabella. */
const table = () => screen.getByRole("table");

const renderDevices = async () => {
    renderWithProviders(<DevicesPage />);
    await within(table()).findByText("Notebook");
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    listDevices.mockResolvedValue(page(devices));
});

/**
 * `SimpleEntityPage` è la pagina delle quattro anagrafiche: si prova attraverso Dispositivi
 * e Difetti, che sono le due configurazioni reali più semplici.
 */
describe("SimpleEntityPage", () => {
    it("elenca le righe caricate dal server", async () => {
        await renderDevices();

        expect(within(table()).getByText("Smartphone")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Visualizzati 1-2 di 2");
        expect(listDevices).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 10, search: "" }));
    });

    it("crea una riga e ricarica la lista", async () => {
        createDevice.mockResolvedValue({ id: 3 });
        await renderDevices();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo dispositivo" }));
        const dialog = screen.getByRole("dialog", { name: "Nuovo dispositivo" });
        await userEvent.type(within(dialog).getByLabelText(/Nome dispositivo/), "  Tablet  ");
        await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(createDevice).toHaveBeenCalledWith({ name: "Tablet" });
        });
        await waitFor(() => {
            expect(listDevices).toHaveBeenCalledTimes(2);
        });
        expect(toastSuccess).toHaveBeenCalledWith("Dispositivo creato con successo");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("non crea una riga con il nome vuoto e lo dice sotto il campo", async () => {
        await renderDevices();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo dispositivo" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

        expect(within(dialog).getByRole("alert")).toHaveTextContent("Il nome del dispositivo non può essere vuoto");
        expect(createDevice).not.toHaveBeenCalled();
    });

    it("modifica la riga scelta partendo dai suoi valori", async () => {
        updateDevice.mockResolvedValue({ id: 2 });
        await renderDevices();

        await userEvent.click(within(table()).getByRole("button", { name: "Modifica dispositivo 2" }));
        const dialog = screen.getByRole("dialog", { name: "Modifica dispositivo" });
        const input = within(dialog).getByLabelText(/Nome dispositivo/);
        await waitFor(() => {
            expect(input).toHaveValue("Smartphone");
        });

        await userEvent.clear(input);
        await userEvent.type(input, "Smartphone Pro");
        await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(updateDevice).toHaveBeenCalledWith(2, { name: "Smartphone Pro" });
        });
        expect(toastSuccess).toHaveBeenCalledWith("Dispositivo aggiornato con successo");
    });

    it("mostra l'errore del server e lascia il dialogo aperto", async () => {
        createDevice.mockRejectedValue(new Error("Dispositivo già esistente"));
        await renderDevices();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo dispositivo" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText(/Nome dispositivo/), "Notebook");
        await userEvent.click(within(dialog).getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Dispositivo già esistente");
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(listDevices).toHaveBeenCalledTimes(1);
    });

    it("elimina dopo la conferma scritta, con il nome nella domanda", async () => {
        deleteDevice.mockResolvedValue({ id: 1 });
        await renderDevices();

        await userEvent.click(within(table()).getByRole("button", { name: "Elimina dispositivo 1" }));
        const dialog = screen.getByRole("dialog", { name: "Elimina dispositivo" });
        expect(dialog).toHaveAccessibleDescription("Sei sicuro di voler eliminare il dispositivo Notebook?");

        await userEvent.type(within(dialog).getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(deleteDevice).toHaveBeenCalledWith(1);
        });
        expect(toastSuccess).toHaveBeenCalledWith("Dispositivo eliminato con successo");
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(listDevices).toHaveBeenCalledTimes(2);
    });

    it("se l'eliminazione fallisce lo dice e resta sul dialogo", async () => {
        deleteDevice.mockRejectedValue(new Error("Dispositivo usato in 3 report"));
        await renderDevices();

        await userEvent.click(within(table()).getByRole("button", { name: "Elimina dispositivo 1" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.type(within(dialog).getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Dispositivo usato in 3 report");
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    /** Una lista vuota invita a creare; una ricerca senza esiti dice cosa si è cercato. */
    it("distingue la lista vuota dalla ricerca senza risultati", async () => {
        listDevices.mockResolvedValue(page([]));
        renderWithProviders(<DevicesPage />);

        expect(await within(table()).findByText("Nessun dispositivo disponibile.")).toBeInTheDocument();

        await userEvent.type(screen.getByRole("searchbox"), "mrio");

        expect(await within(table()).findByText('Nessun risultato per "mrio".')).toBeInTheDocument();
        await waitFor(() => {
            expect(listDevices).toHaveBeenLastCalledWith(expect.objectContaining({ search: "mrio" }));
        });
    });

    it("non offre modifica ed eliminazione per le righe bloccate", async () => {
        listIssues.mockResolvedValue(
            page([
                { id: 1, description: "Altro", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
                { id: 2, description: "Schermo rotto", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
            ])
        );
        renderWithProviders(<IssuesPage />);
        await within(table()).findByText("Schermo rotto");

        expect(within(table()).queryByRole("button", { name: "Modifica difetto 1" })).not.toBeInTheDocument();
        expect(within(table()).queryByRole("button", { name: "Elimina difetto 1" })).not.toBeInTheDocument();
        expect(within(table()).getByRole("button", { name: "Modifica difetto 2" })).toBeInTheDocument();
    });
});
