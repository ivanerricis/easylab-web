import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
    getReport: vi.fn(),
    listDevices: vi.fn(),
    listIssues: vi.fn(),
    listCollaborators: vi.fn(),
    listTechnicians: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
    const errors = await vi.importActual<typeof import("@/lib/api/errors")>("@/lib/api/errors");
    const forwarded = Object.fromEntries(
        Object.keys(api).map((name) => [
            name,
            (...args: unknown[]) => (api[name as keyof typeof api] as (...a: unknown[]) => unknown)(...args),
        ])
    );
    return { ...errors, ...forwarded };
});

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import EditReportDialog from "./editReportDialog";
import { renderWithProviders } from "@/test/render";

const baseReport = {
    customerId: 1,
    deviceId: 1,
    issueId: 1,
    collaboratorId: null,
    technicianId: null,
    technicianPrice: 0,
    issueDescription: null,
    serviceDescription: null,
    password: null,
    paymentMethod: "non_paid" as const,
    price: 0,
    dataBackup: false,
    charger: false,
    alerted: false,
    closed: false,
};

const report = (id: number, note: string) => ({ ...baseReport, id, note });

const loadingText = "Caricamento dati del report...";

const renderDialog = (props: Partial<React.ComponentProps<typeof EditReportDialog>> = {}) =>
    renderWithProviders(
        <EditReportDialog
            open
            reportId={1}
            customerName="Mario Rossi"
            onOpenChange={vi.fn()}
            onSubmit={vi.fn()}
            {...props}
        />
    );

beforeEach(() => {
    vi.clearAllMocks();
    api.listDevices.mockResolvedValue([]);
    api.listIssues.mockResolvedValue([]);
    api.listCollaborators.mockResolvedValue([]);
    api.listTechnicians.mockResolvedValue([]);
});

describe("EditReportDialog: onOpenChange come evento", () => {
    /**
     * D10: `onOpenChange` arrivava come dipendenza dell'effetto di caricamento, e le pagine lo
     * passano come freccia scritta al volo — diversa a ogni loro render, come durante
     * `onSubmit`, quando il genitore ricarica la lista e si ri-renderizza. L'effetto ripartiva
     * da capo: report già pronto compreso, e il modulo tornava per un istante allo stato di
     * caricamento.
     */
    it("un genitore che si ri-renderizza con una nuova freccia non fa ripartire il caricamento", async () => {
        api.getReport.mockResolvedValue(report(1, "Nota originale"));

        const { rerender } = renderDialog();

        await waitFor(() => {
            expect(screen.queryByText(loadingText)).not.toBeInTheDocument();
        });
        expect(api.getReport).toHaveBeenCalledTimes(1);

        // Stessa identità di `open`/`reportId`, ma `onOpenChange` è una funzione nuova: il
        // caso di un genitore che si ri-renderizza (es. durante `onSubmit`) con una closure
        // scritta sul posto.
        rerender(
            <EditReportDialog open reportId={1} customerName="Mario Rossi" onOpenChange={() => {}} onSubmit={vi.fn()} />
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(api.getReport).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(loadingText)).not.toBeInTheDocument();
        expect(screen.getByLabelText("Note")).toHaveValue("Nota originale");
    });
});

describe("EditReportDialog: risposta superata", () => {
    it("la risposta di un report precedente non sovrascrive quella del report aperto dopo", async () => {
        let resolveFirst!: (value: unknown) => void;
        api.getReport.mockImplementation((id: number) => {
            if (id === 1) {
                return new Promise((resolve) => {
                    resolveFirst = resolve;
                });
            }
            return Promise.resolve(report(2, "Nota del secondo report"));
        });

        const { rerender } = renderDialog({ reportId: 1 });

        expect(screen.getByText(loadingText)).toBeInTheDocument();

        // Il dialogo resta aperto ma passa a un altro report prima che il primo abbia risposto.
        rerender(
            <EditReportDialog open reportId={2} customerName="Anna Verdi" onOpenChange={vi.fn()} onSubmit={vi.fn()} />
        );

        await waitFor(() => {
            expect(screen.getByLabelText("Note")).toHaveValue("Nota del secondo report");
        });

        // La risposta del primo report, superata, arriva ora: non deve rimpiazzare il modulo.
        await act(async () => {
            resolveFirst(report(1, "Nota del primo report"));
            await Promise.resolve();
        });

        expect(screen.getByLabelText("Note")).toHaveValue("Nota del secondo report");
    });
});

/**
 * I prezzi erano campi numerici: "25,50" (la virgola italiana) arrivava vuoto e `Number("")`
 * lo salvava come 0 senza dire niente. Ora la virgola si legge, e un testo illeggibile ferma il
 * salvataggio con l'errore accanto al campo.
 */
describe("EditReportDialog: prezzi", () => {
    vi.setConfig({ testTimeout: 20000 });

    it("legge la virgola e rifiuta un importo illeggibile invece di salvarlo come zero", async () => {
        api.getReport.mockResolvedValue(report(1, ""));
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        renderDialog({ onSubmit });

        const technicianPrice = await screen.findByLabelText("Prezzo lavoro tecnico");
        await userEvent.clear(technicianPrice);
        await userEvent.type(technicianPrice, "25,5 euro");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        expect(await screen.findByText("Importo non valido")).toBeInTheDocument();
        expect(technicianPrice).toHaveAttribute("aria-invalid", "true");
        expect(onSubmit).not.toHaveBeenCalled();

        await userEvent.clear(technicianPrice);
        await userEvent.type(technicianPrice, "25,50");
        await userEvent.click(screen.getByRole("button", { name: "Salva" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ technicianPrice: 25.5 }));
        });
    });
});
