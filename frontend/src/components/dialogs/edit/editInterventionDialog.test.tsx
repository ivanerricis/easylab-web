import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getIntervention: vi.fn(),
    listCollaborators: vi.fn(),
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

import EditInterventionDialog from "./editInterventionDialog";
import { renderWithProviders } from "@/test/render";

const baseIntervention = {
    type: "intervento_sede" as const,
    status: "programmato" as const,
    description: null,
    problem: "Non si accende",
    price: null,
    paid: false,
    toInvoice: false,
    collaboratorId: 1,
    interventionDate: "2026-09-20",
    startTime: null,
    endTime: null,
};

const intervention = (id: number, note: string) => ({ ...baseIntervention, id, note });

const loadingText = "Caricamento dati dell'intervento...";

const renderDialog = (props: Partial<React.ComponentProps<typeof EditInterventionDialog>> = {}) =>
    renderWithProviders(
        <EditInterventionDialog
            open
            interventionId={1}
            customerName="Mario Rossi"
            onOpenChange={vi.fn()}
            onSubmit={vi.fn()}
            {...props}
        />
    );

beforeEach(() => {
    vi.clearAllMocks();
    api.listCollaborators.mockResolvedValue([{ id: 1, firstName: "Luca", lastName: "Bianchi", phoneNumber: null }]);
});

describe("EditInterventionDialog: onOpenChange come evento", () => {
    /**
     * D10: stesso problema di `EditReportDialog` — `onOpenChange` fra le dipendenze
     * dell'effetto faceva ripartire il caricamento a ogni render del genitore con una nuova
     * freccia, anche a intervento già pronto.
     */
    it("un genitore che si ri-renderizza con una nuova freccia non fa ripartire il caricamento", async () => {
        api.getIntervention.mockResolvedValue(intervention(1, "Nota originale"));

        const { rerender } = renderDialog();

        await waitFor(() => {
            expect(screen.queryByText(loadingText)).not.toBeInTheDocument();
        });
        expect(api.getIntervention).toHaveBeenCalledTimes(1);

        rerender(
            <EditInterventionDialog
                open
                interventionId={1}
                customerName="Mario Rossi"
                onOpenChange={() => {}}
                onSubmit={vi.fn()}
            />
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(api.getIntervention).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText("Note")).toHaveValue("Nota originale");
    });
});

describe("EditInterventionDialog: risposta superata", () => {
    it("la risposta di un intervento precedente non sovrascrive quello aperto dopo", async () => {
        let resolveFirst!: (value: unknown) => void;
        api.getIntervention.mockImplementation((id: number) => {
            if (id === 1) {
                return new Promise((resolve) => {
                    resolveFirst = resolve;
                });
            }
            return Promise.resolve(intervention(2, "Nota del secondo intervento"));
        });

        const { rerender } = renderDialog({ interventionId: 1 });

        expect(screen.getByText(loadingText)).toBeInTheDocument();

        rerender(
            <EditInterventionDialog
                open
                interventionId={2}
                customerName="Anna Verdi"
                onOpenChange={vi.fn()}
                onSubmit={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByLabelText("Note")).toHaveValue("Nota del secondo intervento");
        });

        await act(async () => {
            resolveFirst(intervention(1, "Nota del primo intervento"));
            await Promise.resolve();
        });

        expect(screen.getByLabelText("Note")).toHaveValue("Nota del secondo intervento");
    });
});
