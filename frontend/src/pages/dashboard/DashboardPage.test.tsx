import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = vi.hoisted(() => ({
    getReportStats: vi.fn(),
    getInterventionStats: vi.fn(),
    listInterventions: vi.fn(),
    createIntervention: vi.fn(),
    createReport: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    return {
        ...errors,
        getReportStats: (...args: unknown[]) => api.getReportStats(...args),
        getInterventionStats: (...args: unknown[]) => api.getInterventionStats(...args),
        listInterventions: (...args: unknown[]) => api.listInterventions(...args),
        createIntervention: (...args: unknown[]) => api.createIntervention(...args),
        createReport: (...args: unknown[]) => api.createReport(...args),
        getReportPrintUrl: (id: number) => `/api/reports/${id}/print`,
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

vi.mock("sonner", () => ({
    toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn(), warning: vi.fn() },
}));

/**
 * Il calendario ha i suoi test: qui lo sostituisce un pulsante che crea un intervento (come fa
 * il doppio click su un giorno) e annuncia un intervallo al montaggio, come quello vero.
 */
let interventionValues: unknown;
let interventionError: unknown;

vi.mock("@/pages/calendar/components/interventions-calendar", async () => {
    const { useEffect } = await import("react");
    const CalendarStub = ({
        onCreateIntervention,
        onRangeChange,
    }: {
        onCreateIntervention: (values: unknown) => Promise<void>;
        onRangeChange: (range: { from: string; to: string }) => void;
    }) => {
        useEffect(() => {
            onRangeChange({ from: "2026-08-31", to: "2026-10-04" });
        }, [onRangeChange]);

        return (
            <button
                onClick={() =>
                    void Promise.resolve(onCreateIntervention(interventionValues)).catch((error: unknown) => {
                        interventionError = error;
                    })
                }
            >
                Crea dal calendario
            </button>
        );
    };
    return { default: CalendarStub };
});

import DashboardPage from "./DashboardPage";
import { renderWithProviders } from "@/test/render";

const reportStats = {
    openCount: 12,
    closedCount: 30,
    monthlyRevenue: 1520.5,
    series: [
        { monthKey: "2026-08", value: 900 },
        { monthKey: "2026-09", value: 1520.5 },
    ],
};

const renderPage = async () => {
    renderWithProviders(<DashboardPage />);
    await screen.findByText("12");
};

beforeEach(() => {
    vi.clearAllMocks();
    interventionError = undefined;
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 11, 10, 0));
    api.getReportStats.mockResolvedValue(reportStats);
    api.getInterventionStats.mockResolvedValue({ programmatoCount: 4, inLavorazioneCount: 2, completatoCount: 7 });
    api.listInterventions.mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 1000, totalPages: 0 });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("DashboardPage", () => {
    it("mostra i contatori del mese corrente", async () => {
        await renderPage();

        expect(api.getReportStats).toHaveBeenCalledWith("2026-09");
        for (const [label, value] of [
            ["Report aperti", "12"],
            ["Report chiusi", "30"],
            ["Interventi programmati", "4"],
            ["Interventi in lavorazione", "2"],
            ["Interventi completati", "7"],
        ]) {
            expect(screen.getByRole("button", { name: new RegExp(`${label}.*${value}`) })).toBeInTheDocument();
        }
    });

    it("carica gli interventi del periodo mostrato dal calendario", async () => {
        await renderPage();

        await waitFor(() => {
            expect(api.listInterventions).toHaveBeenCalledWith(
                expect.objectContaining({ scheduledFrom: "2026-08-31", scheduledTo: "2026-10-04" })
            );
        });
    });

    it("ogni contatore porta all'elenco già filtrato", async () => {
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: /Report chiusi/ }));
        await userEvent.click(screen.getByRole("button", { name: /Interventi in lavorazione/ }));

        expect(navigate).toHaveBeenCalledWith("/reports?visibility=closed");
        expect(navigate).toHaveBeenCalledWith("/interventions?status=in_lavorazione");
    });

    it("i contatori si attivano anche da tastiera", async () => {
        await renderPage();

        screen.getByRole("button", { name: /Report aperti/ }).focus();
        await userEvent.keyboard("{Enter}");

        expect(navigate).toHaveBeenCalledWith("/reports?visibility=open");
    });

    /** L'incasso è nascosto finché non si apre la card: la dashboard sta spesso in vista al banco. */
    it("nasconde l'incasso finché non si apre la card, poi sfoglia i mesi", async () => {
        await renderPage();

        const card = screen.getByRole("button", { name: /Incassi mese/ });
        expect(card).not.toHaveTextContent("1520,50");

        await userEvent.click(card);
        const dialog = screen.getByRole("dialog", { name: "Incassi mese" });
        // In it-IT le migliaia si separano solo da cinque cifre in su: 1520,50 è corretto.
        expect(within(dialog).getByText(/1520,50/)).toBeInTheDocument();
        expect(within(dialog).getByText("settembre 2026")).toBeInTheDocument();
        // Il mese corrente è l'ultimo: non si va nel futuro.
        expect(within(dialog).getByRole("button", { name: "Mese successivo" })).toBeDisabled();

        await userEvent.click(within(dialog).getByRole("button", { name: "Mese precedente" }));

        await waitFor(() => {
            expect(api.getReportStats).toHaveBeenLastCalledWith("2026-08");
        });
        expect(within(dialog).getByText("agosto 2026")).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Mese successivo" })).toBeEnabled();
    });

    it("segnala se i contatori non si caricano", async () => {
        api.getReportStats.mockRejectedValue(new Error("Database non raggiungibile"));
        renderWithProviders(<DashboardPage />);

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Database non raggiungibile");
        });
    });

    it("crea un intervento dal calendario con la nota, poi aggiorna calendario e contatori", async () => {
        resolveCustomerId.mockResolvedValue(30);
        api.createIntervention.mockResolvedValue({ id: 77 });
        vi.spyOn(window, "confirm").mockReturnValue(false);
        interventionValues = {
            type: "consegna_materiale",
            status: "programmato",
            description: null,
            problem: null,
            note: "Lasciare in portineria",
            customer: "Mario Rossi - 333",
            customerId: 30,
            collaboratorId: 40,
            interventionDate: "2026-09-15",
            startTime: null,
            endTime: null,
        };
        await renderPage();
        await waitFor(() => {
            expect(api.listInterventions).toHaveBeenCalledTimes(1);
        });

        await userEvent.click(screen.getByRole("button", { name: "Crea dal calendario" }));

        await waitFor(() => {
            expect(api.createIntervention).toHaveBeenCalledWith(
                expect.objectContaining({ note: "Lasciare in portineria", customerId: 30 })
            );
        });
        await waitFor(() => {
            expect(api.listInterventions).toHaveBeenCalledTimes(2);
        });
        expect(api.getReportStats).toHaveBeenCalledTimes(2);
        expect(openPrintWindow).not.toHaveBeenCalled();
    });

    it("lascia al dialogo l'errore di creazione, senza mostrarlo una seconda volta", async () => {
        resolveCustomerId.mockRejectedValue(new Error("Seleziona un cliente esistente o creane uno nuovo."));
        interventionValues = { customer: "Nessuno", customerId: null };
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Crea dal calendario" }));

        await waitFor(() => {
            expect(interventionError).toBeInstanceOf(Error);
        });
        expect(toastError).not.toHaveBeenCalled();
    });
});
