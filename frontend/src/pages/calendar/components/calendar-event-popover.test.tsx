import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import type { InterventionCalendarEvent } from "../hooks/useCalendarInterventions";
import { AgendaEvent, CalendarEventWrapper } from "./calendar-event-popover";
import { getEventAccessibleLabel } from "../eventAccessibleLabel";

const intervention: InterventionCalendarEvent["resource"] = {
    id: 12,
    type: "intervento_remoto",
    description: "Configurata la stampante di rete",
    status: "completato",
    interventionDate: "2026-09-14",
    startTime: "09:00:00",
    endTime: "10:30:00",
    customerId: 3,
    collaboratorId: 5,
    customer: "Mario Rossi",
    customerPhone: null,
    collaborator: "Anna Bianchi",
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: null,
};

const calendarEvent = (resource: InterventionCalendarEvent["resource"] = intervention): InterventionCalendarEvent => ({
    id: resource.id,
    title: "09:00 Mario Rossi",
    start: new Date(2026, 8, 14, 9, 0),
    end: new Date(2026, 8, 14, 10, 30),
    resource,
});

type WrapperProps = ComponentProps<typeof CalendarEventWrapper>;

/**
 * Come lo usa la libreria: il figlio è il riquadro `.rbc-event`, che nella vista mese non ha
 * `tabIndex` né ruolo.
 */
const renderWrapper = (resource: InterventionCalendarEvent["resource"] = intervention) =>
    render(
        <CalendarEventWrapper {...({ event: calendarEvent(resource), type: "date" } as unknown as WrapperProps)}>
            <div className="rbc-event">09:00 Mario Rossi</div>
        </CalendarEventWrapper>
    );

const anchor = () => screen.getByRole("button", { name: /^Mario Rossi, / });

describe("getEventAccessibleLabel", () => {
    it("dice cliente, tipo, giorno, orario e stato", () => {
        expect(getEventAccessibleLabel(calendarEvent())).toBe(
            "Mario Rossi, Intervento da remoto, lunedì 14 settembre dalle 09:00 alle 10:30, Completato"
        );
    });

    it("per una consegna senza orario lo dice", () => {
        expect(getEventAccessibleLabel({ ...calendarEvent(), allDay: true })).toBe(
            "Mario Rossi, Intervento da remoto, lunedì 14 settembre senza orario, Completato"
        );
    });
});

describe("CalendarEventWrapper", () => {
    /** Nella vista mese l'evento non si raggiungeva con Tab, e da tastiera non si apriva. */
    it("rende il riquadro dell'evento un pulsante raggiungibile con Tab, con il nome completo", () => {
        renderWrapper();

        const button = anchor();
        expect(button).toHaveClass("rbc-event");
        expect(button).toHaveAttribute("tabindex", "0");
        expect(button).toHaveAccessibleName(
            "Mario Rossi, Intervento da remoto, lunedì 14 settembre dalle 09:00 alle 10:30, Completato"
        );
    });

    it("chiuso mostra solo il titolo dell'evento", () => {
        renderWrapper();

        expect(screen.queryByText("Anna Bianchi")).not.toBeInTheDocument();
    });

    it("al passaggio del mouse mostra i dettagli dell'intervento, e li toglie all'uscita", async () => {
        renderWrapper();

        fireEvent.mouseEnter(anchor());

        expect(await screen.findByText("Anna Bianchi")).toBeInTheDocument();
        expect(screen.getByText("Completato")).toBeInTheDocument();
        expect(screen.getByText("Intervento da remoto")).toBeInTheDocument();
        // Lo stesso formato delle colonne "Data/Orario" (`InterventionSchedule`): l'orario in un
        // elemento suo, che non va a capo sul trattino.
        expect(screen.getByText("09:00-10:30").parentElement).toHaveTextContent("14/09/2026 09:00-10:30");
        expect(screen.getByText("Configurata la stampante di rete")).toBeInTheDocument();

        fireEvent.mouseLeave(anchor());

        await waitFor(() => {
            expect(screen.queryByText("Anna Bianchi")).not.toBeInTheDocument();
        });
    });

    /**
     * Chi naviga da tastiera deve poter leggere gli stessi dettagli di chi usa il mouse. Il focus
     * vero, non un `fireEvent.focus`: prima l'aggancio era uno `span` che il focus non poteva
     * raggiungere, e il test con l'evento simulato passava lo stesso.
     */
    it("si apre al focus da tastiera sul riquadro, e si chiude lasciandolo", async () => {
        renderWrapper();

        act(() => anchor().focus());
        expect(await screen.findByText("Anna Bianchi")).toBeInTheDocument();

        act(() => anchor().blur());
        await waitFor(() => {
            expect(screen.queryByText("Anna Bianchi")).not.toBeInTheDocument();
        });
    });

    it("resta aperto passando dal titolo al riquadro", async () => {
        renderWrapper();

        fireEvent.mouseEnter(anchor());
        const detail = await screen.findByText("Anna Bianchi");
        // Nel browser l'uscita dal titolo e l'entrata nel riquadro arrivano nello stesso giro
        // di eventi, e React le applica insieme: da qui la singola `act`.
        act(() => {
            fireEvent.mouseLeave(anchor());
            fireEvent.mouseEnter(detail);
        });

        expect(screen.getByText("Anna Bianchi")).toBeInTheDocument();
    });

    it.each([
        ["senza orario solo la data", { endTime: null }, "14/09/2026"],
        ["senza data un trattino", { interventionDate: null }, "-"],
    ])("%s", async (_label, overrides, expected) => {
        renderWrapper({ ...intervention, ...overrides });

        fireEvent.mouseEnter(anchor());

        const when = await screen.findByText("Quando:");
        expect(when.parentElement).toHaveTextContent(`Quando: ${expected}`);
    });

    it("senza descrizione non lascia una riga vuota", async () => {
        renderWrapper({ ...intervention, description: null, status: "programmato" });

        fireEvent.mouseEnter(anchor());

        expect(await screen.findByText("Programmato")).toBeInTheDocument();
        expect(screen.queryByText("Configurata la stampante di rete")).not.toBeInTheDocument();
    });
});

describe("AgendaEvent", () => {
    /**
     * Nell'agenda la libreria non usa `eventWrapper`: l'evento è un pulsante vero, e il suo click
     * (anche da Invio o Spazio) risale alla cella della tabella, che apre il dettaglio.
     */
    it("è un pulsante con il nome completo, e mostra i dettagli al focus", async () => {
        const props = { event: calendarEvent(), title: "09:00 Mario Rossi" } as unknown as ComponentProps<
            typeof AgendaEvent
        >;
        render(<AgendaEvent {...props} />);

        const button = anchor();
        expect(button.tagName).toBe("BUTTON");
        expect(button).toHaveAttribute("type", "button");

        act(() => button.focus());
        expect(await screen.findByText("Anna Bianchi")).toBeInTheDocument();
    });
});
