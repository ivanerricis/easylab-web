import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => toastSuccess(...args),
        error: (...args: unknown[]) => toastError(...args),
    },
}));

import DetailDeleteButton from "./detail-delete-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocationProbe } from "@/test/locationProbe";

const onDelete = vi.fn();

const ReportDetail = () => (
    <DetailDeleteButton
        label="Elimina report"
        title="Elimina report"
        description="Sei sicuro?"
        onDelete={onDelete}
        successMessage="Report eliminato con successo"
        errorMessage="Impossibile eliminare il report"
        redirectTo="/reports"
    />
);

const ReportList = () => {
    const navigate = useNavigate();

    return <button onClick={() => navigate("/reports/5")}>Apri</button>;
};

const appRoutes = (
    <>
        <Routes>
            <Route path="/reports/:id" element={<ReportDetail />} />
            <Route path="*" element={<ReportList />} />
        </Routes>
        <LocationProbe />
    </>
);

const renderAt = (route: string) =>
    render(
        <TooltipProvider>
            <MemoryRouter initialEntries={[route]}>{appRoutes}</MemoryRouter>
        </TooltipProvider>
    );

/**
 * Con la cronologia vera del browser, come nell'app: il dialogo di conferma vi aggiunge una voce
 * sua finché è aperto (`useDialogHistoryEntry`), ed è lì che un `navigate(-1)` fatto troppo presto
 * sbaglierebbe voce. `MemoryRouter` non la vede, quindi non basterebbe a provarlo.
 */
const renderInBrowserAt = (route: string) => {
    window.history.replaceState(null, "", route);
    return render(
        <TooltipProvider>
            <BrowserRouter>{appRoutes}</BrowserRouter>
        </TooltipProvider>
    );
};

const deleteFromDetail = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Elimina report" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "ELIMINA");
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
};

beforeEach(() => {
    vi.clearAllMocks();
    onDelete.mockResolvedValue({});
});

describe("DetailDeleteButton", () => {
    /**
     * Prima andava a `/reports` sostituendo la voce: un elenco nuovo, senza la ricerca e la pagina
     * da cui si era aperta la scheda. Ora torna indietro, e l'elenco riappare com'era.
     */
    it("dopo l'eliminazione torna all'elenco da cui si era aperta la scheda, filtri compresi", async () => {
        renderAt("/reports?q=rossi&page=3");

        await userEvent.click(screen.getByRole("button", { name: "Apri" }));
        await deleteFromDetail();

        await waitFor(() => {
            expect(screen.getByTestId("location")).toHaveTextContent("/reports?q=rossi&page=3");
        });
        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(toastSuccess).toHaveBeenCalledWith("Report eliminato con successo");
    });

    it("con la cronologia del browser torna davvero all'elenco, non alla voce del dialogo", async () => {
        renderInBrowserAt("/reports?q=rossi&page=3");

        await userEvent.click(screen.getByRole("button", { name: "Apri" }));
        expect(screen.getByTestId("location")).toHaveTextContent("/reports/5");

        await deleteFromDetail();

        await waitFor(() => {
            expect(screen.getByTestId("location")).toHaveTextContent("/reports?q=rossi&page=3");
        });
        expect(window.location.pathname + window.location.search).toBe("/reports?q=rossi&page=3");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("senza una pagina precedente porta all'elenco indicato", async () => {
        renderAt("/reports/5");

        await deleteFromDetail();

        await waitFor(() => {
            expect(screen.getByTestId("location")).toHaveTextContent(/^\/reports$/);
        });
    });

    it("se l'eliminazione fallisce resta sulla scheda con il dialogo aperto", async () => {
        onDelete.mockRejectedValue(new Error("boom"));
        renderAt("/reports/5");

        await deleteFromDetail();

        await waitFor(() => expect(toastError).toHaveBeenCalledWith("boom"));
        expect(screen.getByTestId("location")).toHaveTextContent("/reports/5");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
});
