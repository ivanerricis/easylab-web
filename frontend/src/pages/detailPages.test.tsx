import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

// `vi.hoisted`: il mock qui sotto viene sollevato in cima al file e legge l'oggetto subito,
// non dentro una funzione chiamata più tardi.
const api = vi.hoisted(() => ({
    getReport: vi.fn(),
    getIntervention: vi.fn(),
    getCustomer: vi.fn(),
    listDevices: vi.fn(),
    listIssues: vi.fn(),
    listCollaborators: vi.fn(),
    listTechnicians: vi.fn(),
    updateReport: vi.fn(),
    updateIntervention: vi.fn(),
    createReportTechnician: vi.fn(),
    updateReportTechnician: vi.fn(),
    deleteReportTechnician: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forwarded = Object.fromEntries(
        Object.keys(api).map((name) => [
            name,
            (...args: unknown[]) => (api[name as keyof typeof api] as (...a: unknown[]) => unknown)(...args),
        ])
    );
    return {
        ...errors,
        ...forwarded,
        getReportPrintUrl: (id: number) => `/api/reports/${id}/print`,
        getInterventionPrintUrl: (id: number) => `/api/interventions/${id}/print`,
    };
});

const openPrintWindow = vi.fn();

vi.mock("@/lib/utils", async () => {
    const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
    return { ...actual, openPrintWindow: (...args: unknown[]) => openPrintWindow(...args) };
});

const toastError = vi.fn();

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));

let editValues: unknown;

vi.mock("@/components/dialogs/edit/editReportDialog", () => ({
    default: ({ open, onSubmit }: { open: boolean; onSubmit: (v: unknown) => Promise<void> }) =>
        open ? <button onClick={() => void onSubmit(editValues)}>Invia modifica</button> : null,
}));

vi.mock("@/components/dialogs/edit/editInterventionDialog", () => ({
    default: ({ open, onSubmit }: { open: boolean; onSubmit: (v: unknown) => Promise<void> }) =>
        open ? <button onClick={() => void onSubmit(editValues)}>Invia modifica</button> : null,
}));

import InterventionPage from "./interventions/InterventionPage";
import ReportPage from "./reports/ReportPage";
import { renderWithProviders } from "@/test/render";

/** Come arriva da axios una risposta 404: `getApiErrorStatus` guarda solo questi campi. */
const notFoundError = () =>
    Object.assign(new Error("Request failed with status code 404"), {
        isAxiosError: true,
        response: { status: 404, data: { message: "Not found" } },
    });

const timestamps = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };

/** Il valore di una voce `DetailItem`: l'etichetta è un paragrafo, il valore quello dopo. */
const detailValue = (label: string) => {
    const labelElement = screen
        .getAllByText(label)
        .find((element) => element.tagName === "P" && element.className.includes("uppercase"));
    return labelElement?.nextElementSibling?.textContent;
};

const report = {
    id: 5,
    customerId: 30,
    deviceId: 10,
    issueId: 21,
    collaboratorId: 40,
    technicianId: 50,
    technicianPrice: 25,
    // I nomi arrivano con il report (`GET /reports/:id`), non dai cataloghi.
    technicianName: "Paolo",
    customerName: "Mario Rossi",
    customerPhone: "06 123456",
    deviceName: "Notebook",
    issueName: "Altro",
    collaboratorName: "Luca Bianchi",
    note: "Graffio sul coperchio",
    password: "0000",
    issueDescription: "Non carica",
    serviceDescription: null,
    dataBackup: true,
    charger: false,
    alerted: true,
    closed: false,
    price: 80,
    paymentMethod: "card",
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    document.title = "EasyLab";
    api.getCustomer.mockResolvedValue({
        id: 30,
        firstName: "Mario",
        lastName: "Rossi",
        phoneNumber: null,
        phoneNumberSecondary: "06 123456",
        ...timestamps,
    });
    api.listDevices.mockResolvedValue([{ id: 10, name: "Notebook", ...timestamps }]);
    api.listIssues.mockResolvedValue([{ id: 21, description: "Altro", ...timestamps }]);
    api.listCollaborators.mockResolvedValue([{ id: 40, firstName: "Luca", lastName: "Bianchi", ...timestamps }]);
    api.listTechnicians.mockResolvedValue([{ id: 50, firstName: "Paolo", lastName: null, ...timestamps }]);
    api.getReport.mockResolvedValue(report);
    api.updateReport.mockResolvedValue({});
    api.updateIntervention.mockResolvedValue({});
    api.deleteReportTechnician.mockResolvedValue({});
});

describe("ReportPage", () => {
    const renderPage = async (id = "5") => {
        renderWithProviders(<ReportPage />, { route: `/reports/${id}`, path: "/reports/:id" });
        await screen.findByRole("heading", { level: 1 });
    };

    it("mostra il report con i nomi che arrivano insieme a lui, senza scaricare i cataloghi", async () => {
        await renderPage();

        expect(api.getReport).toHaveBeenCalledTimes(1);
        for (const catalog of [api.listDevices, api.listIssues, api.listCollaborators, api.listTechnicians]) {
            expect(catalog).not.toHaveBeenCalled();
        }
        expect(api.getCustomer).not.toHaveBeenCalled();

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Report #5 - Mario Rossi");
        expect(document.title).toBe("Report #5 - Mario Rossi · EasyLab");
        expect(detailValue("Telefono")).toBe("06 123456");
        // Il cliente porta alla sua scheda: prima era solo testo.
        expect(screen.getByRole("link", { name: "Mario Rossi" })).toHaveAttribute("href", "/clients/30");
        expect(detailValue("Dispositivo")).toBe("Notebook");
        expect(detailValue("Difetto catalogo")).toBe("Altro");
        expect(detailValue("Collaboratore")).toBe("Luca Bianchi");
        expect(detailValue("Problema riscontrato")).toBe("Non carica");
        expect(detailValue("Avvisato")).toBe("Sì");
        expect(detailValue("Alimentatore")).toBe("No");
        expect(screen.getByText("Carta")).toBeInTheDocument();
        expect(screen.getByText("Paolo")).toBeInTheDocument();
    });

    /** Il totale è prezzo interno più tecnici: è la cifra che il cliente paga. */
    it("somma il prezzo interno e quello del tecnico nel totale", async () => {
        await renderPage();

        const euro = (text: string) => text.replace(/\s/g, " ");
        const totalCard = screen.getByText("Totale").closest("[data-slot='card']");
        expect(euro(totalCard?.textContent ?? "")).toContain("105,00 €");
    });

    it("senza tecnico lo dice invece di mostrare una tabella vuota", async () => {
        api.getReport.mockResolvedValue({ ...report, technicianId: null, technicianPrice: 0 });
        await renderPage();

        expect(screen.getByText("Nessun tecnico associato a questo report.")).toBeInTheDocument();
    });

    it("regge un report senza nome del cliente", async () => {
        api.getReport.mockResolvedValue({ ...report, customerName: null });
        await renderPage();

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Report #5 - Cliente sconosciuto");
    });

    /**
     * Un indirizzo con un id impossibile resta dov'è e dice che cosa è successo: prima
     * riportava all'elenco con un avviso che spariva da solo.
     */
    it("mostra 'non trovato' con un id non valido, senza chiedere niente al server", async () => {
        renderWithProviders(<ReportPage />, { route: "/reports/abc", path: "/reports/:id" });

        expect(await screen.findByRole("heading", { name: "Report non trovato" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Vai ai report" })).toHaveAttribute("href", "/reports");
        expect(navigate).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
        expect(api.getReport).not.toHaveBeenCalled();
    });

    it("mostra 'non trovato' se il server risponde 404", async () => {
        api.getReport.mockRejectedValue(notFoundError());
        renderWithProviders(<ReportPage />, { route: "/reports/999", path: "/reports/:id" });

        expect(await screen.findByRole("heading", { name: "Report non trovato" })).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    it("torna all'elenco se il report non si carica", async () => {
        api.getReport.mockRejectedValue(new Error("Report non trovato"));
        renderWithProviders(<ReportPage />, { route: "/reports/5", path: "/reports/:id" });

        await waitFor(() => {
            expect(navigate).toHaveBeenCalledWith("/reports");
        });
        expect(toastError).toHaveBeenCalledWith("Report non trovato");
    });

    it("stampa e, dopo una modifica che toglie il tecnico, ricarica la scheda", async () => {
        editValues = { reportId: 5, technicianId: null, existingTechnicianId: 50, internalPrice: 80 };
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Stampa report" }));
        expect(openPrintWindow).toHaveBeenCalledWith("/api/reports/5/print");

        await userEvent.click(screen.getByRole("button", { name: "Modifica report" }));
        await userEvent.click(screen.getByRole("button", { name: "Invia modifica" }));

        await waitFor(() => {
            expect(api.deleteReportTechnician).toHaveBeenCalledWith(5, 50);
        });
        await waitFor(() => {
            expect(api.getReport).toHaveBeenCalledTimes(2);
        });
    });
});

describe("InterventionPage", () => {
    const intervention = {
        id: 9,
        type: "intervento_remoto",
        description: null,
        problem: "VPN non si collega",
        note: "Chiamare dopo le 15",
        status: "in_lavorazione",
        interventionDate: "2026-09-10",
        startTime: "09:00:00",
        endTime: null,
        customerId: 30,
        collaboratorId: 99,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: null,
        customerName: "Mario Rossi",
        customerPhone: "06 123456",
        collaboratorName: null,
    };

    const renderPage = async () => {
        renderWithProviders(<InterventionPage />, { route: "/interventions/9", path: "/interventions/:id" });
        await screen.findByRole("heading", { level: 1 });
    };

    beforeEach(() => {
        api.getIntervention.mockResolvedValue(intervention);
    });

    it("mostra l'intervento con problema e nota", async () => {
        await renderPage();

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mario Rossi");
        expect(screen.getByRole("link", { name: "Mario Rossi" })).toHaveAttribute("href", "/clients/30");
        expect(detailValue("Problema")).toBe("VPN non si collega");
        expect(detailValue("Note")).toBe("Chiamare dopo le 15");
        expect(detailValue("Descrizione")).toBe("-");
        // Senza nome del collaboratore la pagina lo dice, invece di restare vuota.
        expect(detailValue("Collaboratore")).toBe("Collaboratore sconosciuto");
        expect(api.listCollaborators).not.toHaveBeenCalled();
        expect(screen.getByText("In lavorazione")).toBeInTheDocument();
        expect(screen.getByText("Intervento da remoto")).toBeInTheDocument();
    });

    it("non mostra il problema per una consegna", async () => {
        api.getIntervention.mockResolvedValue({ ...intervention, type: "consegna_materiale", problem: null });
        await renderPage();

        expect(screen.queryByText("Problema")).not.toBeInTheDocument();
    });

    it("salva la modifica con la nota e ricarica", async () => {
        editValues = {
            interventionId: 9,
            type: "intervento_remoto",
            status: "completato",
            description: "Riconfigurato il client",
            problem: "VPN non si collega",
            note: "Tutto a posto",
            collaboratorId: 40,
            interventionDate: "2026-09-10",
            startTime: "09:00",
            endTime: "09:40",
        };
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Modifica intervento" }));
        await userEvent.click(screen.getByRole("button", { name: "Invia modifica" }));

        await waitFor(() => {
            expect(api.updateIntervention).toHaveBeenCalledWith(
                9,
                expect.objectContaining({ note: "Tutto a posto", status: "completato" })
            );
        });
        await waitFor(() => {
            expect(api.getIntervention).toHaveBeenCalledTimes(2);
        });
    });

    it("stampa l'intervento", async () => {
        await renderPage();

        await userEvent.click(screen.getByRole("button", { name: "Stampa intervento" }));

        expect(openPrintWindow).toHaveBeenCalledWith("/api/interventions/9/print");
    });
});
