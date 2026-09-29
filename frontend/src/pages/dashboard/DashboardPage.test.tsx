import { act, screen, waitFor, within } from "@testing-library/react";
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
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
        success: (...args: unknown[]) => toastSuccess(...args),
        warning: vi.fn(),
    },
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

/**
 * I dialoghi di creazione hanno i loro test: qui sono pulsanti che consegnano i valori scelti dal
 * test, e che esistono solo a dialogo aperto (la pagina li carica pigramente alla prima apertura).
 */
vi.mock("@/components/dialogs/create/createReportDialog", () => ({
    default: ({ open, onSubmit }: { open: boolean; onSubmit: (values: unknown) => Promise<void> }) =>
        open ? <button onClick={() => void onSubmit({})}>Invia report</button> : null,
}));

vi.mock("@/components/dialogs/create/createInterventionDialog", () => ({
    default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Nuovo intervento" /> : null),
}));

vi.mock("@/lib/reportForm", async () => {
    const actual = await vi.importActual<typeof import("@/lib/reportForm")>("@/lib/reportForm");
    return { ...actual, resolveReportReferences: vi.fn().mockResolvedValue({}), toReportCreatePayload: () => ({}) };
});

import DashboardPage from "./DashboardPage";
import { renderWithProviders } from "@/test/render";

const reportStats = {
    openCount: 12,
    closedCount: 30,
    monthlyRevenue: 1520.5,
    monthlyNetRevenue: 1320.5,
    series: [
        { monthKey: "2026-08", value: 900, netValue: 800 },
        { monthKey: "2026-09", value: 1520.5, netValue: 1320.5 },
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

        expect(api.getReportStats).toHaveBeenCalledWith("2026-09", expect.any(AbortSignal));
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
        expect(within(dialog).getByText(/1320,50/)).toBeInTheDocument();
        expect(within(dialog).getByText("settembre 2026")).toBeInTheDocument();
        // Il confronto con il mese prima, scritto e non solo colorato: (1520,50 - 900) / 900.
        expect(within(dialog).getByText(/\+69% rispetto ad agosto 2026/)).toBeInTheDocument();
        // Gli importi stanno sopra le barre, non solo nel fumetto del mouse, in forma corta (vedi
        // `formatBarValueShort`): 900 resta intero, 1520,50 diventa "2k".
        expect(within(dialog).getByText(/^900$/)).toBeInTheDocument();
        expect(within(dialog).getByText(/^2k$/)).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: /^set: / })).toHaveAttribute("aria-pressed", "true");
        // Il mese corrente è l'ultimo: non si va nel futuro.
        expect(within(dialog).getByRole("button", { name: "Mese successivo" })).toBeDisabled();

        await userEvent.click(within(dialog).getByRole("button", { name: "Mese precedente" }));

        await waitFor(() => {
            expect(api.getReportStats).toHaveBeenLastCalledWith("2026-08", expect.any(AbortSignal));
        });
        expect(within(dialog).getByText("agosto 2026")).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Mese successivo" })).toBeEnabled();
        // Luglio non è nella serie: senza il mese precedente il confronto non si inventa.
        expect(within(dialog).queryByText(/rispetto/)).not.toBeInTheDocument();
    });

    /**
     * Il mese in corso si confronta con il mese prima fino allo stesso giorno: l'11 settembre,
     * contro tutto agosto, il calo usciva quasi sempre anche a parità di lavoro.
     */
    it("per il mese in corso confronta con il mese prima fino allo stesso giorno", async () => {
        api.getReportStats.mockResolvedValue({ ...reportStats, previousMonthToDate: { revenue: 500, days: 11 } });
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));
        const dialog = screen.getByRole("dialog", { name: "Incassi mese" });

        // (1520,50 - 500) / 500, non (1520,50 - 900) / 900 del mese intero.
        expect(within(dialog).getByText(/\+204% rispetto ai primi 11 giorni di agosto 2026/)).toBeInTheDocument();
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
        // Un intervento cambia i contatori degli interventi, non gli incassi dei report.
        expect(api.getInterventionStats).toHaveBeenCalledTimes(2);
        expect(api.getReportStats).toHaveBeenCalledTimes(1);
        expect(toastSuccess).toHaveBeenCalledWith("Intervento #77 creato", expect.any(Object));
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

    /** Il focus entra nel dialogo: prima restava sulla scheda sotto il velo, fuori dal dialogo. */
    it("aprendo gli incassi il focus va sul dialogo, non sulla freccia del mese", async () => {
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));

        const dialog = screen.getByRole("dialog", { name: "Incassi mese" });
        expect(dialog).toHaveFocus();
    });

    /** I contatori degli interventi non dipendono dal mese degli incassi. */
    it("cambiando mese non richiede i contatori degli interventi", async () => {
        await renderPage();
        expect(api.getInterventionStats).toHaveBeenCalledTimes(1);

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));
        await userEvent.click(screen.getByRole("button", { name: "Mese precedente" }));

        await waitFor(() => {
            expect(api.getReportStats).toHaveBeenLastCalledWith("2026-08", expect.any(AbortSignal));
        });
        expect(api.getInterventionStats).toHaveBeenCalledTimes(1);
    });

    /**
     * Due clic veloci sulla freccia: la risposta di agosto arriva dopo quella di luglio, e prima
     * scriveva i suoi incassi sotto l'etichetta di luglio.
     */
    it("sfogliando in fretta vale solo la risposta dell'ultimo mese scelto", async () => {
        await renderPage();
        const pending = new Map<string, (value: unknown) => void>();
        api.getReportStats.mockImplementation((month: string) => new Promise((resolve) => pending.set(month, resolve)));

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));
        const dialog = screen.getByRole("dialog", { name: "Incassi mese" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Mese precedente" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Mese precedente" }));
        expect(within(dialog).getByText("luglio 2026")).toBeInTheDocument();

        await act(async () => {
            pending.get("2026-07")?.({ ...reportStats, monthlyRevenue: 700, monthlyNetRevenue: 600 });
        });
        await act(async () => {
            pending.get("2026-08")?.({ ...reportStats, monthlyRevenue: 800, monthlyNetRevenue: 750 });
        });

        expect(within(dialog).getByText("luglio 2026")).toBeInTheDocument();
        expect(within(dialog).getByText(/^700,00/)).toBeInTheDocument();
        expect(within(dialog).queryByText(/^800,00/)).not.toBeInTheDocument();
    });

    it("sfogliando i mesi annulla la richiesta del mese superato", async () => {
        await renderPage();
        const signals = new Map<string, AbortSignal>();
        api.getReportStats.mockImplementation((month: string, signal: AbortSignal) => {
            signals.set(month, signal);
            return new Promise(() => {});
        });

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));
        const dialog = screen.getByRole("dialog", { name: "Incassi mese" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Mese precedente" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Mese precedente" }));

        expect(signals.get("2026-08")?.aborted).toBe(true);
        expect(signals.get("2026-07")?.aborted).toBe(false);
    });

    /** Su errore l'etichetta torna al mese dei numeri a schermo, invece di mentire. */
    it("se il mese scelto non si carica, l'etichetta torna al mese caricato", async () => {
        await renderPage();
        api.getReportStats.mockRejectedValue(new Error("Database non raggiungibile"));

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));
        const dialog = screen.getByRole("dialog", { name: "Incassi mese" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Mese precedente" }));

        await waitFor(() => {
            expect(toastError).toHaveBeenCalledWith("Database non raggiungibile");
        });
        expect(within(dialog).getByText("settembre 2026")).toBeInTheDocument();
        expect(within(dialog).getByText(/^1520,50/)).toBeInTheDocument();
        // Un solo tentativo: tornare al mese caricato non deve far partire un'altra richiesta.
        expect(api.getReportStats).toHaveBeenCalledTimes(2);
    });

    /** Senza dati il riquadro dice "—", non "0,00 €": un mese vuoto e un errore non si confondono. */
    it("se i dati non arrivano mostra un trattino, non zero", async () => {
        api.getReportStats.mockRejectedValue(new Error("Database non raggiungibile"));
        api.getInterventionStats.mockRejectedValue(new Error("Database non raggiungibile"));
        renderWithProviders(<DashboardPage />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Report aperti/ })).toHaveTextContent("—");
        });
        expect(screen.getByRole("button", { name: /Interventi completati/ })).toHaveTextContent("—");

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));
        const dialog = screen.getByRole("dialog", { name: "Incassi mese" });
        expect(within(dialog).queryByText(/0,00/)).not.toBeInTheDocument();
        expect(within(dialog).getAllByText("—")).toHaveLength(2);
    });

    /** Il dialogo si scarica alla prima apertura: le scorciatoie devono aprirlo lo stesso. */
    it.each([
        ["r", "Invia report"],
        ["i", "Nuovo intervento"],
    ])("la scorciatoia %s apre il dialogo di creazione", async (key, name) => {
        await renderPage();

        await userEvent.keyboard(key);

        expect(await screen.findByRole(key === "r" ? "button" : "dialog", { name })).toBeInTheDocument();
    });

    it("dopo aver creato un report ricarica gli incassi del mese scelto", async () => {
        api.createReport.mockResolvedValue({ id: 5 });
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: /Incassi mese/ }));
        await userEvent.click(screen.getByRole("button", { name: "Mese precedente" }));
        await waitFor(() => {
            expect(api.getReportStats).toHaveBeenLastCalledWith("2026-08", expect.any(AbortSignal));
        });
        await userEvent.keyboard("{Escape}");

        await userEvent.click(screen.getByRole("button", { name: "Nuovo report" }));
        await userEvent.click(await screen.findByRole("button", { name: "Invia report" }));

        await waitFor(() => {
            expect(toastSuccess).toHaveBeenCalledWith("Report #5 creato", expect.any(Object));
        });
        expect(api.getReportStats).toHaveBeenLastCalledWith("2026-08", expect.any(AbortSignal));
        expect(api.getReportStats).toHaveBeenCalledTimes(3);
    });
});
