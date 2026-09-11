import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = {
    listReports: vi.fn(),
    createReport: vi.fn(),
    updateReport: vi.fn(),
    deleteReport: vi.fn(),
    createReportTechnician: vi.fn(),
    updateReportTechnician: vi.fn(),
    deleteReportTechnician: vi.fn(),
    getReportPrintUrl: vi.fn((id: number) => `/api/reports/${id}/print`),
};

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forward =
        (name: keyof typeof api) =>
        (...args: unknown[]) =>
            (api[name] as (...a: unknown[]) => unknown)(...args);
    return {
        ...errors,
        listReports: forward("listReports"),
        createReport: forward("createReport"),
        updateReport: forward("updateReport"),
        deleteReport: forward("deleteReport"),
        createReportTechnician: forward("createReportTechnician"),
        updateReportTechnician: forward("updateReportTechnician"),
        deleteReportTechnician: forward("deleteReportTechnician"),
        getReportPrintUrl: forward("getReportPrintUrl"),
    };
});

const resolveReportReferences = vi.fn();

vi.mock("@/lib/reportForm", async () => {
    const actual = await vi.importActual<typeof import("@/lib/reportForm")>("@/lib/reportForm");
    return { ...actual, resolveReportReferences: (...args: unknown[]) => resolveReportReferences(...args) };
});

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

/**
 * I dialoghi hanno i loro test (components/dialogs): qui vengono sostituiti da un pulsante che
 * consegna i valori scelti dal test, così si prova solo quello che la pagina ne fa.
 */
let createValues: unknown;
let createError: unknown;
let editValues: unknown;

vi.mock("@/components/dialogs/create/createReportDialog", () => ({
    default: ({ open, onSubmit }: { open: boolean; onSubmit: (values: unknown) => Promise<void> }) =>
        open ? (
            <button
                onClick={() =>
                    void onSubmit(createValues).catch((error: unknown) => {
                        createError = error;
                    })
                }
            >
                Invia creazione
            </button>
        ) : null,
}));

vi.mock("@/components/dialogs/edit/editReportDialog", () => ({
    default: ({
        open,
        reportId,
        customerName,
        onSubmit,
    }: {
        open: boolean;
        reportId: number | null;
        customerName: string;
        onSubmit: (values: unknown) => Promise<void>;
    }) =>
        open ? (
            <button onClick={() => void onSubmit(editValues)}>
                Invia modifica {reportId} {customerName}
            </button>
        ) : null,
}));

import ReportsPage from "./ReportsPage";
import { renderWithProviders } from "@/test/render";

const buildReport = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    customerId: 30,
    deviceId: 10,
    issueId: 20,
    collaboratorId: null,
    note: null,
    password: null,
    issueDescription: null,
    serviceDescription: null,
    dataBackup: false,
    charger: false,
    alerted: false,
    paymentMethod: "non_paid",
    price: 0,
    customer: `Cliente ${id}`,
    customerPhone: "333",
    device: "Notebook",
    issue: "Schermo rotto",
    technician: "-",
    internalPrice: 0,
    technicianPrice: 0,
    totalPrice: 0,
    closed: false,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: null,
    ...overrides,
});

const page = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 10, totalPages: 1 });

const baseEdit = {
    reportId: 1,
    customerId: 30,
    deviceId: 10,
    issueId: 20,
    collaboratorId: null,
    technicianId: null,
    existingTechnicianId: null,
    technicianPrice: 0,
    issueDescription: null,
    serviceDescription: null,
    note: null,
    password: null,
    paymentMethod: "cash",
    dataBackup: false,
    charger: false,
    alerted: false,
    closed: false,
    internalPrice: 50,
};

const table = () => screen.getByRole("table");

const renderPage = async (route = "/reports") => {
    renderWithProviders(<ReportsPage />, { route });
    await within(table()).findByText("Cliente 1");
};

const submitEdit = async (values: Record<string, unknown>) => {
    editValues = { ...baseEdit, ...values };
    await userEvent.click(within(table()).getByRole("button", { name: "Modifica report 1" }));
    await userEvent.click(screen.getByRole("button", { name: /Invia modifica/ }));
    await waitFor(() => {
        expect(api.updateReport).toHaveBeenCalled();
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.listReports.mockResolvedValue(page([buildReport(1), buildReport(2, { closed: true })]));
    api.updateReport.mockResolvedValue({});
    api.createReportTechnician.mockResolvedValue({});
    api.updateReportTechnician.mockResolvedValue({});
    api.deleteReportTechnician.mockResolvedValue({});
});

describe("ReportsPage", () => {
    it("mostra di default i report aperti, e lo stato di ogni riga", async () => {
        await renderPage();

        expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ visibility: "open" }));
        expect(within(table()).getAllByText("Aperto")).toHaveLength(1);
        expect(within(table()).getByText("Chiuso")).toBeInTheDocument();
    });

    /** Dalla dashboard si arriva qui con `?visibility=closed`: il filtro deve rispettarlo. */
    it("legge il filtro di stato dall'indirizzo", async () => {
        await renderPage("/reports?visibility=closed");

        expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ visibility: "closed" }));
        expect(screen.getByRole("combobox", { name: "Filtra per stato" })).toHaveTextContent("Report chiusi");
    });

    it("ignora un filtro di stato sconosciuto nell'indirizzo", async () => {
        await renderPage("/reports?visibility=boh");

        expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ visibility: "open" }));
    });

    it("apre la scheda e stampa dalla riga", async () => {
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Apri report 2" }));
        await userEvent.click(within(table()).getByRole("button", { name: "Stampa report 1" }));

        expect(navigate).toHaveBeenCalledWith("/reports/2");
        expect(openPrintWindow).toHaveBeenCalledWith("/api/reports/1/print");
    });

    it("passa al dialogo di modifica il report e il nome del cliente", async () => {
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Modifica report 2" }));

        expect(screen.getByRole("button", { name: "Invia modifica 2 Cliente 2" })).toBeInTheDocument();
    });

    describe("tecnico esterno al salvataggio", () => {
        it("lo aggiunge se il report non ne aveva", async () => {
            await renderPage();

            await submitEdit({ technicianId: 50, technicianPrice: 25 });

            await waitFor(() => {
                expect(api.createReportTechnician).toHaveBeenCalledWith({ reportId: 1, technicianId: 50, price: 25 });
            });
            expect(api.deleteReportTechnician).not.toHaveBeenCalled();
            expect(api.updateReport).toHaveBeenCalledWith(1, expect.objectContaining({ price: 50 }));
        });

        it("ne aggiorna il prezzo se è lo stesso tecnico", async () => {
            await renderPage();

            await submitEdit({ technicianId: 50, existingTechnicianId: 50, technicianPrice: 40 });

            await waitFor(() => {
                expect(api.updateReportTechnician).toHaveBeenCalledWith(1, 50, 40);
            });
            expect(api.createReportTechnician).not.toHaveBeenCalled();
        });

        it("lo sostituisce se è cambiato", async () => {
            await renderPage();

            await submitEdit({ technicianId: 51, existingTechnicianId: 50, technicianPrice: 30 });

            await waitFor(() => {
                expect(api.createReportTechnician).toHaveBeenCalledWith({ reportId: 1, technicianId: 51, price: 30 });
            });
            expect(api.deleteReportTechnician).toHaveBeenCalledWith(1, 50);
            // Prima si toglie il vecchio, poi si aggiunge il nuovo.
            expect(api.deleteReportTechnician.mock.invocationCallOrder[0]).toBeLessThan(
                api.createReportTechnician.mock.invocationCallOrder[0]
            );
        });

        it("lo toglie se non è più indicato", async () => {
            await renderPage();

            await submitEdit({ technicianId: null, existingTechnicianId: 50 });

            await waitFor(() => {
                expect(api.deleteReportTechnician).toHaveBeenCalledWith(1, 50);
            });
            expect(api.createReportTechnician).not.toHaveBeenCalled();
            expect(api.updateReportTechnician).not.toHaveBeenCalled();
        });

        it("non tocca nulla se non c'era e non c'è", async () => {
            await renderPage();

            await submitEdit({});

            await waitFor(() => {
                expect(api.listReports).toHaveBeenCalledTimes(2);
            });
            expect(api.createReportTechnician).not.toHaveBeenCalled();
            expect(api.updateReportTechnician).not.toHaveBeenCalled();
            expect(api.deleteReportTechnician).not.toHaveBeenCalled();
        });
    });

    it("crea il report con i riferimenti risolti e propone di stamparlo", async () => {
        resolveReportReferences.mockResolvedValue({
            customerId: 30,
            deviceId: 10,
            issueId: 20,
            issueDescription: null,
        });
        api.createReport.mockResolvedValue({ id: 99 });
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        createValues = {
            customer: "Mario Rossi - 333",
            deviceType: "Notebook",
            issue: "Schermo rotto",
            issueDescription: null,
            password: "  ",
            notes: " Graffio sul coperchio ",
            charger: true,
            dataBackup: false,
            customerId: 30,
            deviceId: 10,
            issueId: 20,
        };
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo report" }));
        await userEvent.click(screen.getByRole("button", { name: "Invia creazione" }));

        await waitFor(() => {
            expect(openPrintWindow).toHaveBeenCalledWith("/api/reports/99/print");
        });
        expect(api.createReport).toHaveBeenCalledWith({
            deviceId: 10,
            issueId: 20,
            customerId: 30,
            note: "Graffio sul coperchio",
            password: null,
            issueDescription: null,
            dataBackup: false,
            charger: true,
        });
        expect(confirm).toHaveBeenCalledWith("Report creato. Vuoi stamparlo adesso?");
    });

    it("non stampa se l'utente rifiuta", async () => {
        resolveReportReferences.mockResolvedValue({
            customerId: 30,
            deviceId: 10,
            issueId: 20,
            issueDescription: null,
        });
        api.createReport.mockResolvedValue({ id: 99 });
        vi.spyOn(window, "confirm").mockReturnValue(false);
        createValues = { notes: "", password: "", charger: false, dataBackup: false };
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo report" }));
        await userEvent.click(screen.getByRole("button", { name: "Invia creazione" }));

        await waitFor(() => {
            expect(api.listReports).toHaveBeenCalledTimes(2);
        });
        expect(openPrintWindow).not.toHaveBeenCalled();
    });

    /**
     * L'errore lo mostra il dialogo, che resta aperto: la pagina deve solo farglielo arrivare.
     * Prima lo mostrava anche la pagina, e ogni errore di creazione compariva due volte.
     */
    it("lascia al dialogo l'errore di creazione, senza mostrarlo una seconda volta", async () => {
        createError = undefined;
        resolveReportReferences.mockRejectedValueOnce(new Error("Seleziona un cliente esistente o creane uno nuovo."));
        createValues = {};
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Crea nuovo report" }));
        await act(async () => {
            await userEvent.click(screen.getByRole("button", { name: "Invia creazione" }));
        });

        await waitFor(() => {
            expect(createError).toEqual(new Error("Seleziona un cliente esistente o creane uno nuovo."));
        });
        expect(toastError).not.toHaveBeenCalled();
        expect(api.createReport).not.toHaveBeenCalled();
    });

    it("elimina un report dopo la conferma", async () => {
        api.deleteReport.mockResolvedValue({});
        await renderPage();

        await userEvent.click(within(table()).getByRole("button", { name: "Elimina report 1" }));
        const dialog = screen.getByRole("dialog", { name: "Elimina report" });
        await userEvent.type(within(dialog).getByLabelText("Digita ELIMINA per confermare"), "ELIMINA");
        await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

        await waitFor(() => {
            expect(api.deleteReport).toHaveBeenCalledWith(1);
        });
        expect(toastSuccess).toHaveBeenCalledWith("Report eliminato con successo");
    });
});
