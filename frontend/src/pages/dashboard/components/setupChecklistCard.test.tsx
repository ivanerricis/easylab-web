import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SetupChecklistCard from "./setupChecklistCard";

const api = vi.hoisted(() => ({ getSetupChecklist: vi.fn(), dismissSetupChecklist: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { isAdmin: true } as { isAdmin: boolean } | null }));

vi.mock("@/lib/api", () => ({
    getSetupChecklist: (...args: unknown[]) => api.getSetupChecklist(...args),
    dismissSetupChecklist: (...args: unknown[]) => api.dismissSetupChecklist(...args),
}));
vi.mock("@/components/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));

const renderCard = () =>
    render(
        <MemoryRouter>
            <SetupChecklistCard />
        </MemoryRouter>
    );

const steps = (company: boolean, email: boolean, backup: boolean) => ({
    steps: [
        { key: "company", done: company },
        { key: "email", done: email },
        { key: "backup", done: backup },
    ],
    dismissed: false,
});

describe("SetupChecklistCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auth.user = { isAdmin: true };
        api.dismissSetupChecklist.mockResolvedValue({ ...steps(false, false, false), dismissed: true });
    });

    it("mostra i passi con il conteggio e il link alla sezione giusta", async () => {
        api.getSetupChecklist.mockResolvedValue(steps(true, false, false));
        renderCard();

        expect(await screen.findByText("1 di 3 completati. Configura il resto quando vuoi.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Invio email/ })).toHaveAttribute("href", "/settings?section=email");
        expect(screen.getByRole("link", { name: /Dati del laboratorio/ })).toHaveTextContent("(fatto)");
    });

    it("non compare per un utente non amministratore e non chiama il server", () => {
        auth.user = { isAdmin: false };
        renderCard();

        expect(screen.queryByTestId("setup-checklist")).not.toBeInTheDocument();
        expect(api.getSetupChecklist).not.toHaveBeenCalled();
    });

    it("sparisce quando tutti i passi sono fatti o la guida è stata chiusa", async () => {
        api.getSetupChecklist.mockResolvedValue(steps(true, true, true));
        renderCard();

        await waitFor(() => expect(api.getSetupChecklist).toHaveBeenCalled());
        expect(screen.queryByTestId("setup-checklist")).not.toBeInTheDocument();
    });

    it("chiude la guida subito e lo comunica al server", async () => {
        api.getSetupChecklist.mockResolvedValue(steps(false, false, false));
        renderCard();

        await userEvent.click(await screen.findByRole("button", { name: "Chiudi guida" }));

        expect(screen.queryByTestId("setup-checklist")).not.toBeInTheDocument();
        expect(api.dismissSetupChecklist).toHaveBeenCalledTimes(1);
    });

    it("se il caricamento fallisce non mostra nulla", async () => {
        api.getSetupChecklist.mockRejectedValue(new Error("rete"));
        renderCard();

        await waitFor(() => expect(api.getSetupChecklist).toHaveBeenCalled());
        expect(screen.queryByTestId("setup-checklist")).not.toBeInTheDocument();
    });
});
