import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const api = vi.hoisted(() => ({
    listCollaborators: vi.fn(),
    listTechnicians: vi.fn(),
    getTechnician: vi.fn(),
    listReports: vi.fn(),
    listInterventions: vi.fn(),
    updateReport: vi.fn(),
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
    return { ...errors, ...forwarded, createCollaborator: vi.fn(), createTechnician: vi.fn() };
});

const toastError = vi.fn();

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));

let editValues: unknown;

vi.mock("@/components/dialogs/edit/editReportDialog", () => ({
    default: ({
        open,
        reportId,
        onSubmit,
    }: {
        open: boolean;
        reportId: number;
        onSubmit: (v: unknown) => Promise<void>;
    }) => (open ? <button onClick={() => void onSubmit(editValues)}>Invia modifica {reportId}</button> : null),
}));

import CollaboratorPage from "./collaborators/CollaboratorPage";
import CollaboratorsPage from "./collaborators/CollaboratorsPage";
import TechnicianPage from "./technicians/TechnicianPage";
import TechniciansPage from "./technicians/TechniciansPage";
import { renderWithProviders } from "@/test/render";

const timestamps = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };
const page = (items: unknown[]) => ({ items, totalItems: items.length, page: 1, pageSize: 10, totalPages: 1 });

const reportRow = {
    id: 5,
    customer: "Mario Rossi",
    customerPhone: "333",
    device: "Notebook",
    issue: "Schermo rotto",
    closed: false,
    technicianPrice: 25,
    totalPrice: 105,
    createdAt: "2026-09-01T10:00:00.000Z",
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.listCollaborators.mockResolvedValue([
        { id: 40, firstName: "Luca", lastName: "Bianchi", phoneNumber: null, ...timestamps },
    ]);
    api.listReports.mockResolvedValue(page([reportRow]));
    api.listInterventions.mockResolvedValue(page([]));
    api.getTechnician.mockResolvedValue({
        id: 50,
        firstName: "Paolo",
        lastName: "Neri",
        phoneNumber: "320",
        vatNumber: "IT123",
        ...timestamps,
    });
    api.updateReport.mockResolvedValue({});
    api.updateReportTechnician.mockResolvedValue({});
});

describe("CollaboratorPage", () => {
    const renderPage = async (id = "40") => {
        renderWithProviders(<CollaboratorPage />, { route: `/collaborators/${id}`, path: "/collaborators/:id" });
        await screen.findByRole("heading", { level: 1 });
    };

    it("mostra il nome e i report del collaboratore", async () => {
        await renderPage();

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Luca Bianchi");
        expect(api.listReports).toHaveBeenCalledWith(
            expect.objectContaining({ collaboratorId: 40, visibility: "all" })
        );
        expect(await within(screen.getByRole("table")).findByText("Mario Rossi")).toBeInTheDocument();
    });

    it("mostra gli interventi assegnati nel secondo tab", async () => {
        await renderPage();

        await userEvent.click(screen.getByRole("tab", { name: "Interventi" }));

        expect(api.listInterventions).toHaveBeenCalledWith(
            expect.objectContaining({ collaboratorId: 40, status: "all" })
        );
        expect(
            await within(screen.getByRole("table")).findByText("Nessun intervento associato a questo collaboratore.")
        ).toBeInTheDocument();
    });

    it("torna all'elenco con un id non valido", async () => {
        renderWithProviders(<CollaboratorPage />, { route: "/collaborators/x", path: "/collaborators/:id" });

        await waitFor(() => {
            expect(navigate).toHaveBeenCalledWith("/collaborators");
        });
        expect(toastError).toHaveBeenCalledWith("Collaboratore non valido");
    });
});

describe("TechnicianPage", () => {
    const renderPage = async () => {
        renderWithProviders(<TechnicianPage />, { route: "/technicians/50", path: "/technicians/:id" });
        await screen.findByRole("heading", { level: 1 });
    };

    it("mostra i dati del tecnico e i report aperti che gli sono affidati", async () => {
        await renderPage();

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Paolo Neri");
        expect(screen.getByText("IT123")).toBeInTheDocument();
        expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ technicianId: 50, visibility: "open" }));
        expect(await within(screen.getByRole("table")).findByText("Mario Rossi")).toBeInTheDocument();
    });

    it("modifica un report dalla scheda e ricarica l'elenco", async () => {
        editValues = {
            reportId: 5,
            technicianId: 50,
            existingTechnicianId: 50,
            technicianPrice: 30,
            internalPrice: 80,
        };
        await renderPage();

        const table = screen.getByRole("table");
        await userEvent.click(await within(table).findByRole("button", { name: /Modifica report 5/ }));
        await userEvent.click(screen.getByRole("button", { name: "Invia modifica 5" }));

        await waitFor(() => {
            expect(api.updateReportTechnician).toHaveBeenCalledWith(5, 50, 30);
        });
        await waitFor(() => {
            expect(api.listReports).toHaveBeenCalledTimes(2);
        });
    });
});

describe("elenchi di collaboratori e tecnici", () => {
    it("aprono la scheda dalla riga", async () => {
        api.listCollaborators.mockResolvedValue(
            page([{ id: 40, firstName: "Luca", lastName: "Bianchi", phoneNumber: null, ...timestamps }])
        );
        api.listTechnicians.mockResolvedValue(
            page([{ id: 50, firstName: "Paolo", lastName: "Neri", phoneNumber: null, vatNumber: null, ...timestamps }])
        );

        const { unmount } = renderWithProviders(<CollaboratorsPage />);
        await userEvent.click(
            await within(screen.getByRole("table")).findByRole("button", { name: "Apri collaboratore 40" })
        );
        expect(navigate).toHaveBeenCalledWith("/collaborators/40");
        unmount();

        renderWithProviders(<TechniciansPage />);
        await userEvent.click(
            await within(screen.getByRole("table")).findByRole("button", { name: "Apri tecnico 50" })
        );
        expect(navigate).toHaveBeenCalledWith("/technicians/50");
    });
});
