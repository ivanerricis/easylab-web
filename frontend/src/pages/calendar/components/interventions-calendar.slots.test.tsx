import { fireEvent, screen } from "@testing-library/react";
import { act, type ComponentProps } from "react";
import type { Calendar, SlotInfo } from "react-big-calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La selezione di uno slot in react-big-calendar lavora sulle coordinate del mouse e del dito e
 * sulle misure degli elementi, che in jsdom valgono sempre zero: qui il calendario della libreria
 * è sostituito da un contenitore che espone le prop ricevute, e la selezione si chiama a mano,
 * dopo aver premuto sul contenitore con il puntatore del tipo voluto.
 */
let calendarProps: ComponentProps<typeof Calendar> | undefined;

vi.mock("react-big-calendar", async () => {
    const actual = await vi.importActual<typeof import("react-big-calendar")>("react-big-calendar");
    return {
        ...actual,
        Calendar: (props: ComponentProps<typeof Calendar>) => {
            calendarProps = props;
            return <div data-testid="calendario" />;
        },
    };
});

// Il dialogo vero ha i suoi test: qui basta sapere se è aperto e con quale data.
vi.mock("@/components/dialogs/create/createInterventionDialog", () => ({
    default: ({ open, initialDate }: { open: boolean; initialDate?: string }) =>
        open ? <div role="dialog" aria-label={`Nuovo intervento ${initialDate}`} /> : null,
}));

import InterventionsCalendar from "./interventions-calendar";
import { renderWithProviders } from "@/test/render";

const renderCalendar = () =>
    renderWithProviders(
        <InterventionsCalendar
            events={[]}
            isLoading={false}
            isInitialLoading={false}
            onCreateIntervention={vi.fn()}
            onRangeChange={vi.fn()}
        />
    );

const selectSlot = (pointerType: string, action: SlotInfo["action"]) => {
    // jsdom non ha `PointerEvent`: `fireEvent` crea un evento generico, a cui va aggiunto il tipo.
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(pointerDown, "pointerType", { value: pointerType });
    fireEvent(screen.getByTestId("calendario"), pointerDown);

    const day = new Date(2026, 8, 15);
    act(() => {
        calendarProps?.onSelectSlot?.({ start: day, end: day, slots: [day], action } as SlotInfo);
    });
};

beforeEach(() => {
    calendarProps = undefined;
    localStorage.clear();
});

describe("InterventionsCalendar: creazione da uno slot libero", () => {
    it("col mouse il doppio click apre la creazione con la data del giorno", async () => {
        renderCalendar();

        selectSlot("mouse", "doubleClick");

        expect(await screen.findByRole("dialog", { name: "Nuovo intervento 2026-09-15" })).toBeInTheDocument();
    });

    it.each(["click", "select"] as const)("col mouse un %s non apre niente", (action) => {
        renderCalendar();

        selectSlot("mouse", action);

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    /**
     * Sul telefono il doppio click non arriva mai, e la libreria riconosce solo la pressione
     * lunga: "click" col dito fermo, "select" trascinando. Prima dal calendario non si poteva
     * creare niente.
     */
    it.each(["click", "select"] as const)("col dito la pressione lunga (%s) apre la creazione", async (action) => {
        renderCalendar();

        selectSlot("touch", action);

        expect(await screen.findByRole("dialog", { name: "Nuovo intervento 2026-09-15" })).toBeInTheDocument();
    });
});

describe("InterventionsCalendar: prop del calendario", () => {
    /** Settimana e giorno partivano da mezzanotte, e ogni volta si scorreva fino al mattino. */
    it("settimana e giorno si aprono sulle 8", () => {
        renderCalendar();

        expect(calendarProps?.scrollToTime?.getHours()).toBe(8);
        expect(calendarProps?.scrollToTime?.getMinutes()).toBe(0);
    });
});
