import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import type { InterventionCalendarEvent } from "../hooks/useCalendarInterventions";
import CalendarEventPopover from "./calendar-event-popover";

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

type Props = ComponentProps<typeof CalendarEventPopover>;

const renderPopover = (resource: InterventionCalendarEvent["resource"] = intervention) =>
    render(
        <CalendarEventPopover
            {...({
                title: "09:00 Mario Rossi",
                event: { title: "09:00 Mario Rossi", start: new Date(), end: new Date(), resource },
            } as unknown as Props)}
        />
    );

const anchor = () => screen.getByText("09:00 Mario Rossi");

describe("CalendarEventPopover", () => {
    it("chiuso mostra solo il titolo dell'evento", () => {
        renderPopover();

        expect(screen.queryByText("Anna Bianchi")).not.toBeInTheDocument();
    });

    it("al passaggio del mouse mostra i dettagli dell'intervento, e li toglie all'uscita", async () => {
        renderPopover();

        fireEvent.mouseEnter(anchor());

        expect(await screen.findByText("Anna Bianchi")).toBeInTheDocument();
        expect(screen.getByText("Completato")).toBeInTheDocument();
        expect(screen.getByText("Intervento da remoto")).toBeInTheDocument();
        expect(screen.getByText("14/09/2026 · 09:00-10:30")).toBeInTheDocument();
        expect(screen.getByText("Configurata la stampante di rete")).toBeInTheDocument();

        fireEvent.mouseLeave(anchor());

        await waitFor(() => {
            expect(screen.queryByText("Anna Bianchi")).not.toBeInTheDocument();
        });
    });

    /** Chi naviga da tastiera deve poter leggere gli stessi dettagli di chi usa il mouse. */
    it("si apre anche al focus da tastiera, e si chiude lasciandolo", async () => {
        renderPopover();

        fireEvent.focus(anchor());
        expect(await screen.findByText("Anna Bianchi")).toBeInTheDocument();

        fireEvent.blur(anchor());
        await waitFor(() => {
            expect(screen.queryByText("Anna Bianchi")).not.toBeInTheDocument();
        });
    });

    it("resta aperto passando dal titolo al riquadro", async () => {
        renderPopover();

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
        renderPopover({ ...intervention, ...overrides });

        fireEvent.mouseEnter(anchor());

        const when = await screen.findByText("Quando:");
        expect(when.parentElement).toHaveTextContent(`Quando: ${expected}`);
    });

    it("senza descrizione non lascia una riga vuota", async () => {
        renderPopover({ ...intervention, description: null, status: "programmato" });

        fireEvent.mouseEnter(anchor());

        expect(await screen.findByText("Programmato")).toBeInTheDocument();
        expect(screen.queryByText("Configurata la stampante di rete")).not.toBeInTheDocument();
    });
});
