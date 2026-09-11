import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

const serverLoad = vi.fn();
const serverDismiss = vi.fn();
const remindersLoad = vi.fn();

vi.mock("@/lib/notifications", () => ({
    notificationSources: [
        {
            key: "server",
            label: "Avvisi di sistema",
            load: () => serverLoad(),
            dismiss: (id: string) => serverDismiss(id),
        },
        {
            key: "interventions",
            label: "Interventi di oggi",
            emptyLabel: "Nessun intervento in programma per oggi.",
            load: () => remindersLoad(),
        },
    ],
}));

import { NotificationsMenu } from "./notifications-menu";
import { renderWithProviders } from "@/test/render";

const openMenu = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Notifiche" }));
    return screen.getByRole("menu");
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    serverLoad.mockResolvedValue([]);
    remindersLoad.mockResolvedValue([]);
    serverDismiss.mockResolvedValue(undefined);
});

describe("NotificationsMenu", () => {
    it("mostra il numero di voci da guardare, fino a 9+", async () => {
        remindersLoad.mockResolvedValue(
            Array.from({ length: 12 }, (_, index) => ({ id: String(index), title: `Cliente ${index}` }))
        );

        renderWithProviders(<NotificationsMenu />);

        expect(await screen.findByText("9+")).toBeInTheDocument();
    });

    it("mostra il testo della sezione vuota", async () => {
        renderWithProviders(<NotificationsMenu />);
        await waitFor(() => {
            expect(remindersLoad).toHaveBeenCalled();
        });

        await openMenu();

        expect(screen.getByText("Nessun intervento in programma per oggi.")).toBeInTheDocument();
        // La sezione degli avvisi senza voci e senza testo per il vuoto non compare.
        expect(screen.queryByText("Avvisi di sistema")).not.toBeInTheDocument();
    });

    it("apre la rotta della voce cliccata", async () => {
        serverLoad.mockResolvedValue([
            {
                id: "7",
                title: "Backup fallito",
                tone: "warning",
                description: "Share irraggiungibile",
                href: "/settings",
            },
        ]);
        renderWithProviders(<NotificationsMenu />);
        await screen.findByText("1");

        await openMenu();
        await userEvent.click(screen.getByRole("menuitem", { name: /Backup fallito/ }));

        expect(navigate).toHaveBeenCalledWith("/settings");
    });

    it("chiude una voce senza aprirne la rotta", async () => {
        serverLoad.mockResolvedValue([{ id: "7", title: "Backup fallito", href: "/settings" }]);
        renderWithProviders(<NotificationsMenu />);
        await screen.findByText("1");

        await openMenu();
        await userEvent.click(screen.getByRole("button", { name: "Rimuovi notifica" }));

        expect(serverDismiss).toHaveBeenCalledWith("7");
        expect(navigate).not.toHaveBeenCalled();
        expect(screen.queryByText("Backup fallito")).not.toBeInTheDocument();
    });
});
