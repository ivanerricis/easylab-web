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

const renderCalendar = (onRangeChange = vi.fn()) => {
    renderWithProviders(
        <InterventionsCalendar
            events={[event]}
            isLoading={false}
            isInitialLoading={false}
            onCreateIntervention={vi.fn()}
            onRangeChange={onRangeChange}
        />
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
