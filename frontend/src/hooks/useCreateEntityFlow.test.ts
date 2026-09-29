import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const submitNewReport = vi.fn();
const submitNewIntervention = vi.fn();

vi.mock("@/lib/reportForm", () => ({ submitNewReport: (...args: unknown[]) => submitNewReport(...args) }));
vi.mock("@/lib/interventionForm", () => ({
    submitNewIntervention: (...args: unknown[]) => submitNewIntervention(...args),
}));

vi.mock("@/lib/api", () => ({
    getReportPrintUrl: (id: number) => `/api/reports/${id}/print`,
    getInterventionPrintUrl: (id: number) => `/api/interventions/${id}/print`,
}));

const openPrintWindow = vi.fn();

vi.mock("@/lib/utils", () => ({ openPrintWindow: (...args: unknown[]) => openPrintWindow(...args) }));

const toastSuccess = vi.fn();

vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args) } }));

import { useCreateInterventionFlow, useCreateReportFlow } from "./useCreateEntityFlow";
import type { CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import type { CreateInterventionSubmitValues } from "@/components/dialogs/create/createInterventionDialog";

type ToastOptions = {
    action: { label: string; onClick: () => void };
    cancel: { label: string; onClick: () => void };
};

const lastToastOptions = () => toastSuccess.mock.calls.at(-1)?.[1] as ToastOptions;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("useCreateReportFlow", () => {
    /**
     * L'ordine conta: l'avviso arriva dopo il ricaricamento, così "Apri" non porta a una lista
     * che la riga nuova non ce l'ha ancora.
     */
    it("crea, ricarica e solo dopo mostra l'avviso con Apri e Stampa", async () => {
        const order: string[] = [];
        submitNewReport.mockImplementation(async () => {
            order.push("crea");
            return { id: 99 };
        });
        // Il ricaricamento finisce dopo un giro di attesa, come una richiesta vera: un gestore che
        // non lo aspettasse mostrerebbe l'avviso prima.
        const afterCreate = vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            order.push("ricarica");
        });
        toastSuccess.mockImplementation(() => order.push("avviso"));
        const values = { customer: "Mario Rossi" } as CreateReportSubmitValues;
        const { result } = renderHook(() => useCreateReportFlow(afterCreate));

        await result.current(values);

        expect(submitNewReport).toHaveBeenCalledWith(values);
        expect(order).toEqual(["crea", "ricarica", "avviso"]);
        expect(toastSuccess).toHaveBeenCalledWith("Report #99 creato", expect.any(Object));

        const options = lastToastOptions();
        expect(options.action.label).toBe("Stampa");
        expect(options.cancel.label).toBe("Apri");
        expect(openPrintWindow).not.toHaveBeenCalled();
        options.action.onClick();
        options.cancel.onClick();
        expect(openPrintWindow).toHaveBeenCalledWith("/api/reports/99/print");
        expect(navigate).toHaveBeenCalledWith("/reports/99");
    });

    /** L'errore lo mostra il dialogo: qui deve solo arrivargli, senza ricaricare né avvisare. */
    it("se la creazione fallisce lascia passare l'errore, senza ricaricare né avvisare", async () => {
        submitNewReport.mockRejectedValue(new Error("Seleziona un difetto esistente o creane uno nuovo."));
        const afterCreate = vi.fn(async () => {});
        const { result } = renderHook(() => useCreateReportFlow(afterCreate));

        await expect(result.current({} as CreateReportSubmitValues)).rejects.toThrow(/difetto esistente/);
        expect(afterCreate).not.toHaveBeenCalled();
        expect(toastSuccess).not.toHaveBeenCalled();
    });

    /** La Dashboard passa il gestore al calendario in `memo`: deve restare lo stesso. */
    it("restituisce lo stesso gestore finché non cambia cosa ricaricare", () => {
        const afterCreate = vi.fn(async () => {});
        const { result, rerender } = renderHook(({ reload }) => useCreateReportFlow(reload), {
            initialProps: { reload: afterCreate },
        });
        const first = result.current;

        rerender({ reload: afterCreate });
        expect(result.current).toBe(first);

        rerender({ reload: vi.fn(async () => {}) });
        expect(result.current).not.toBe(first);
    });
});

describe("useCreateInterventionFlow", () => {
    it("crea, ricarica e offre di aprire o stampare l'intervento", async () => {
        submitNewIntervention.mockResolvedValue({ id: 77 });
        const afterCreate = vi.fn(async () => {});
        const values = { customer: "Mario Rossi" } as CreateInterventionSubmitValues;
        const { result } = renderHook(() => useCreateInterventionFlow(afterCreate));

        await result.current(values);

        expect(submitNewIntervention).toHaveBeenCalledWith(values);
        expect(afterCreate).toHaveBeenCalledTimes(1);
        expect(toastSuccess).toHaveBeenCalledWith("Intervento #77 creato", expect.any(Object));

        const options = lastToastOptions();
        options.action.onClick();
        options.cancel.onClick();
        expect(openPrintWindow).toHaveBeenCalledWith("/api/interventions/77/print");
        expect(navigate).toHaveBeenCalledWith("/interventions/77");
    });
});
