import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return { ...actual, useNavigate: () => navigate };
});

// Il dialogo di creazione ha i suoi test, e qui aprirebbe chiamate all'API. Il doppio click su
// un giorno che lo apre non si prova: la selezione di react-big-calendar lavora sulle coordinate
// del mouse e sulle misure degli elementi, che in jsdom valgono sempre zero.
vi.mock("@/components/dialogs/create/createInterventionDialog", () => ({ default: () => null }));

import InterventionsCalendar from "./interventions-calendar";
import type { InterventionCalendarEvent } from "../hooks/useCalendarInterventions";
import { renderWithProviders } from "@/test/render";

const event: InterventionCalendarEvent = {
    id: 9,
    title: "Mario Rossi · Intervento in sede",
    start: new Date(2026, 8, 11, 9, 0),
    end: new Date(2026, 8, 11, 10, 30),
    resource: {
        id: 9,
        type: "intervento_sede",
        description: null,
        status: "programmato",
        interventionDate: "2026-09-11",
        startTime: "09:00:00",
        endTime: "10:30:00",
        customerId: 30,
        collaboratorId: 40,
        customer: "Mario Rossi",
        customerPhone: null,
        collaborator: "Luca",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: null,
    },
};

const renderCalendar = (
    onRangeChange = vi.fn(),
    {
        reactStrictMode = false,
        events = [event],
    }: { reactStrictMode?: boolean; events?: InterventionCalendarEvent[] } = {}
) => {
    renderWithProviders(
        <InterventionsCalendar
            events={events}
            isLoading={false}
            isInitialLoading={false}
            onCreateIntervention={vi.fn()}
            onRangeChange={onRangeChange}
        />,
        { reactStrictMode }
    );
    return onRangeChange;
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true, writable: true });
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    // Venerdì 11 settembre 2026.
    vi.setSystemTime(new Date(2026, 8, 11, 10, 0));
});

afterEach(() => {
    vi.useRealTimers();
});

/**
 * react-big-calendar non chiama `onRangeChange` al montaggio: il primo intervallo lo calcola
 * il componente, e se sbagliasse il calendario resterebbe vuoto (o mostrerebbe meno giorni) fino
 * alla prima navigazione.
 */
describe("InterventionsCalendar: intervallo iniziale", () => {
    it("nella vista mese copre le settimane intere, da lunedì a domenica", () => {
        const onRangeChange = renderCalendar();

        // Il 1° settembre 2026 è martedì e il 30 è mercoledì.
        expect(onRangeChange).toHaveBeenCalledTimes(1);
        expect(onRangeChange).toHaveBeenCalledWith({ from: "2026-08-31", to: "2026-10-04" });
    });

    it("nella vista settimana parte dal lunedì", () => {
        localStorage.setItem("easylab-web-calendar-view", "week");

        expect(renderCalendar()).toHaveBeenCalledWith({ from: "2026-09-07", to: "2026-09-13" });
    });

    it("nella vista giorno è il giorno stesso", () => {
        localStorage.setItem("easylab-web-calendar-view", "day");

        expect(renderCalendar()).toHaveBeenCalledWith({ from: "2026-09-11", to: "2026-09-11" });
    });

    it("nella vista agenda sono i 30 giorni successivi", () => {
        localStorage.setItem("easylab-web-calendar-view", "agenda");

        expect(renderCalendar()).toHaveBeenCalledWith({ from: "2026-09-11", to: "2026-10-11" });
    });
});

describe("InterventionsCalendar", () => {
    it("mostra gli interventi e apre quello cliccato", async () => {
        renderCalendar();

        await userEvent.click(screen.getByText("Mario Rossi · Intervento in sede"));

        expect(navigate).toHaveBeenCalledWith("/interventions/9");
    });

    it("ricorda la vista scelta e annuncia il nuovo intervallo", async () => {
        const onRangeChange = renderCalendar();

        await userEvent.click(screen.getByRole("button", { name: "Settimana" }));

        expect(localStorage.getItem("easylab-web-calendar-view")).toBe("week");
        await waitFor(() => {
            expect(onRangeChange).toHaveBeenLastCalledWith({ from: "2026-09-07", to: "2026-09-13" });
        });
    });

    it("navigando al mese successivo chiede il suo intervallo", async () => {
        const onRangeChange = renderCalendar();

        await userEvent.click(screen.getByRole("button", { name: "Avanti" }));

        // Ottobre 2026: dal lunedì 28 settembre alla domenica 1° novembre.
        await waitFor(() => {
            expect(onRangeChange).toHaveBeenLastCalledWith({ from: "2026-09-28", to: "2026-11-01" });
        });
    });

    /**
     * Non basta che parta la richiesta del nuovo intervallo: in sviluppo la barra restava su
     * "settembre 2026" e la griglia sul mese corrente anche dopo "Avanti" (vedi `date` nel
     * componente). Succedeva solo sotto `StrictMode`, come in `main.tsx`: per questo il test lo
     * accende, e controlla ciò che vede l'utente, compreso "Oggi" che riporta indietro.
     */
    // Quindici secondi invece dei cinque di default: quattro navigazioni con il calendario intero
    // ridisegnato in StrictMode (doppio render) prendono ~2s da sole, e nella suite completa, con
    // gli altri file in parallelo, hanno superato i 5s.
    it("Avanti, Indietro e Oggi cambiano il periodo mostrato nella barra", async () => {
        renderCalendar(vi.fn(), { reactStrictMode: true });

        expect(screen.getByText("settembre 2026")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
        expect(await screen.findByText("ottobre 2026")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
        expect(await screen.findByText("novembre 2026")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Indietro" }));
        expect(await screen.findByText("ottobre 2026")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Oggi" }));
        expect(await screen.findByText("settembre 2026")).toBeInTheDocument();
    }, 15000);

    it("segnala la vista attiva e la cambia", async () => {
        renderCalendar();

        expect(screen.getByRole("button", { name: "Mese" })).toHaveAttribute("aria-pressed", "true");

        await userEvent.click(screen.getByRole("button", { name: "Giorno" }));

        expect(screen.getByRole("button", { name: "Giorno" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Mese" })).toHaveAttribute("aria-pressed", "false");
    });

    /**
     * Il calcolo dell'intervallo iniziale riproduce le regole della libreria: tornando al mese
     * di partenza, l'intervallo che annuncia lei deve coincidere con quello calcolato al montaggio.
     */
    it("l'intervallo iniziale coincide con quello che la libreria annuncia per lo stesso mese", async () => {
        const onRangeChange = renderCalendar();
        const initialRange = onRangeChange.mock.calls[0][0];

        await userEvent.click(screen.getByRole("button", { name: "Avanti" }));
        await userEvent.click(screen.getByRole("button", { name: "Indietro" }));

        await waitFor(() => {
            expect(onRangeChange).toHaveBeenCalledTimes(3);
        });
        expect(onRangeChange.mock.calls[2][0]).toEqual(initialRange);
    });
});

const eventLabel = "Mario Rossi, Intervento in sede, venerdì 11 settembre dalle 09:00 alle 10:30, Programmato";

/**
 * Da tastiera: nella vista mese l'evento non si raggiungeva con Tab (la libreria non gli dà
 * `tabIndex`), e dove si raggiungeva (settimana, giorno) Invio non faceva niente.
 */
describe("InterventionsCalendar: eventi da tastiera", () => {
    it.each([
        ["mese", "month", "{Enter}"],
        ["mese", "month", " "],
        ["settimana", "week", "{Enter}"],
        ["giorno", "day", " "],
    ])("nella vista %s l'evento si raggiunge con Tab e si apre con %j", async (_label, view, key) => {
        localStorage.setItem("easylab-web-calendar-view", view);
        renderCalendar();

        const eventButton = screen.getByRole("button", { name: eventLabel });
        expect(eventButton).toHaveAttribute("tabindex", "0");

        eventButton.focus();
        await userEvent.keyboard(key);

        expect(navigate).toHaveBeenCalledWith("/interventions/9");
    });

    it("gli altri tasti non aprono niente", async () => {
        renderCalendar();

        screen.getByRole("button", { name: eventLabel }).focus();
        await userEvent.keyboard("a");

        expect(navigate).not.toHaveBeenCalled();
    });

    it("nell'agenda l'evento è un pulsante, e Invio apre il dettaglio", async () => {
        localStorage.setItem("easylab-web-calendar-view", "agenda");
        renderCalendar();

        screen.getByRole("button", { name: eventLabel }).focus();
        await userEvent.keyboard("{Enter}");

        expect(navigate).toHaveBeenCalledWith("/interventions/9");
    });
});

/**
 * Il popup "+N altri". In jsdom le misure valgono zero e la libreria non limiterebbe le righe:
 * con un'altezza finta di 20px per ogni elemento, in ogni giorno ci sta un evento solo.
 */
describe('InterventionsCalendar: popup "+N altri"', () => {
    const crowdedDay = Array.from({ length: 4 }, (_, index) => ({
        ...event,
        id: 20 + index,
        title: `Cliente ${index + 1}`,
        resource: { ...event.resource, id: 20 + index, customer: `Cliente ${index + 1}` },
    }));

    beforeEach(() => {
        vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
            DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 20 })
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("il pulsante dice quanti interventi nascosti ci sono per stato", () => {
        const withStatus = (id: number, status: "programmato" | "in_lavorazione" | "completato") => ({
            ...event,
            id,
            title: `Cliente ${id}`,
            // Un `Date` per evento: la priorità di ordinamento viaggia sull'istanza.
            start: new Date(event.start),
            end: new Date(event.end),
            resource: { ...event.resource, id, status },
        });
        renderCalendar(vi.fn(), {
            events: [
                withStatus(31, "completato"),
                withStatus(32, "completato"),
                withStatus(33, "in_lavorazione"),
                withStatus(34, "programmato"),
            ],
        });

        // Il primo posto va al programmato; nascosti restano gli altri tre.
        expect(screen.getByRole("button", { name: "+3 altri: 1 in lavorazione, 2 completati" })).toBeInTheDocument();
        expect(screen.getByText("Cliente 34")).toBeInTheDocument();
    });

    it('si chiude con Esc, e il focus torna al "+N altri"', async () => {
        renderCalendar(vi.fn(), { events: crowdedDay });

        const showMore = screen.getByRole("button", { name: /^\+3 altri/ });
        await userEvent.click(showMore);
        expect(document.querySelector(".rbc-overlay")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        expect(document.querySelector(".rbc-overlay")).not.toBeInTheDocument();
        expect(showMore).toHaveFocus();
    });

    it("aperto da tastiera porta il focus sul primo intervento del popup", async () => {
        renderCalendar(vi.fn(), { events: crowdedDay });

        screen.getByRole("button", { name: /^\+3 altri/ }).focus();
        await userEvent.keyboard("{Enter}");

        await waitFor(() => {
            expect(document.activeElement?.closest(".rbc-overlay")).not.toBeNull();
        });
        expect(document.activeElement).toHaveAccessibleName(/^Cliente 1, /);
    });

    it("Esc senza popup aperto non fa niente", async () => {
        renderCalendar(vi.fn(), { events: crowdedDay });
        const onMouseDown = vi.fn();
        document.addEventListener("mousedown", onMouseDown);

        await userEvent.keyboard("{Escape}");

        document.removeEventListener("mousedown", onMouseDown);
        expect(onMouseDown).not.toHaveBeenCalled();
    });
});
