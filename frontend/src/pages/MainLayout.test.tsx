import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

// L'intestazione vera parla col server (notifiche, utente, aggiornamenti): qui interessa solo
// la struttura attorno alla pagina, quindi i pezzi dell'intestazione sono segnaposto.
vi.mock("@/components/global-search", () => ({ default: () => null }));
vi.mock("@/components/shortcuts-legend", () => ({ default: () => null }));
vi.mock("@/components/notifications-menu", () => ({ NotificationsMenu: () => null }));
vi.mock("@/components/user-badge", () => ({ UserBadge: () => null }));
vi.mock("@/components/main-sidebar", () => ({ default: () => null }));
const watcher = vi.hoisted(() => ({ scheduledAt: null as string | null }));
vi.mock("@/hooks/useUpdateWatcher", () => ({ useUpdateWatcher: () => watcher }));

import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MainLayout } from "./MainLayout";

const Page = ({ title, links }: { title: string; links: { to: string; label: string }[] }) => {
    useDocumentTitle(title);

    return (
        <div>
            {links.map((link) => (
                <Link key={link.to} to={link.to}>
                    {link.label}
                </Link>
            ))}
        </div>
    );
};

const renderLayout = () =>
    // Senza `TooltipProvider` attorno, di proposito: ora lo porta il layout, e il pulsante del
    // menu (che ha un tooltip) fallirebbe il render se mancasse.
    render(
        <MemoryRouter initialEntries={["/a"]}>
            <Routes>
                <Route path="/" element={<MainLayout />}>
                    <Route
                        path="a"
                        element={
                            <Page
                                title="Pagina A"
                                links={[
                                    { to: "/b", label: "Vai a B" },
                                    { to: "/a?page=2", label: "Pagina 2" },
                                ]}
                            />
                        }
                    />
                    <Route path="b" element={<Page title="Pagina B" links={[]} />} />
                </Route>
            </Routes>
        </MemoryRouter>
    );

const main = () => screen.getByRole("main");
const announcer = () => document.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]');

beforeEach(() => {
    document.title = "EasyLab";
    watcher.scheduledAt = null;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("MainLayout: struttura", () => {
    /** Due `<main>` annidati (quello di SidebarInset e quello del layout) venivano annunciati due volte. */
    it("ha un solo punto di riferimento principale, raggiungibile dal link Vai al contenuto", () => {
        renderLayout();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(main()).toHaveAttribute("id", "contenuto-principale");
        expect(main()).toHaveAttribute("tabindex", "-1");
        expect(screen.getByRole("link", { name: "Vai al contenuto" })).toHaveAttribute("href", "#contenuto-principale");
    });

    it("il pulsante del menu è in italiano e dice se il menu è aperto", async () => {
        renderLayout();

        const trigger = screen.getByRole("button", { name: "Apri/chiudi menu" });
        expect(trigger).toHaveAttribute("aria-expanded", "true");

        await userEvent.click(trigger);

        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
});

describe("MainLayout: cambio pagina", () => {
    it("al primo caricamento non sposta il focus e non annuncia niente", async () => {
        renderLayout();

        await screen.findByRole("link", { name: "Vai a B" });
        expect(main()).not.toHaveFocus();
        expect(announcer()).toHaveTextContent("");
    });

    it("porta il focus su <main>, senza scorrere, e annuncia il titolo della pagina nuova", async () => {
        const focus = vi.spyOn(HTMLElement.prototype, "focus");
        renderLayout();

        await userEvent.click(await screen.findByRole("link", { name: "Vai a B" }));

        expect(main()).toHaveFocus();
        expect(focus.mock.contexts.at(-1)).toBe(main());
        expect(focus.mock.calls.at(-1)).toEqual([{ preventScroll: true }]);
        // Senza "· EasyLab": il nome dell'app ripetuto a ogni pagina è solo rumore.
        await waitFor(() => expect(announcer()).toHaveTextContent(/^Pagina B$/));
    });

    /** Filtri e pagina della tabella stanno nei parametri: lì il focus deve restare dov'è. */
    it("se cambiano solo i parametri dell'indirizzo il focus resta dov'è", async () => {
        renderLayout();

        const link = await screen.findByRole("link", { name: "Pagina 2" });
        await userEvent.click(link);
        await act(() => new Promise((resolve) => setTimeout(resolve, 500)));

        expect(main()).not.toHaveFocus();
        expect(announcer()).toHaveTextContent("");
    });
});

describe("MainLayout: banner dell'aggiornamento programmato", () => {
    it("non mostra nulla senza un aggiornamento in programma", () => {
        renderLayout();

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("avvisa tutti, con giorno e ora, che l'app si fermera' per qualche minuto", () => {
        watcher.scheduledAt = new Date(2026, 10, 12, 3, 0).toISOString();

        renderLayout();

        expect(screen.getByRole("status")).toHaveTextContent(
            "Aggiornamento programmato per giovedì 12/11 alle 03:00: l'app sarà ferma per qualche minuto."
        );
    });
});
