import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import TimeField from "./time-field";

// Il popover di Radix misura l'ancora e scorre fino alla voce scelta: jsdom non ha né l'uno né l'altro.
vi.stubGlobal(
    "ResizeObserver",
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
);
Element.prototype.scrollIntoView = vi.fn();

const Harness = ({ initial = "", after, step }: { initial?: string; after?: string; step?: number }) => {
    const [value, setValue] = useState(initial);
    return (
        <>
            <label htmlFor="t">Orario</label>
            <TimeField id="t" value={value} onValueChange={setValue} after={after} step={step} />
            <button type="button">Altrove</button>
        </>
    );
};

const field = () => screen.getByRole("combobox", { name: "Orario" });

describe("TimeField", () => {
    it("propone gli orari a passo di 15 minuti e sceglie con un clic", async () => {
        render(<Harness initial="09:30" />);

        await userEvent.click(field());

        expect(screen.getAllByRole("option")).toHaveLength(96);
        await userEvent.click(screen.getByRole("option", { name: "10:15" }));

        expect(field()).toHaveValue("10:15");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it.each([
        ["9.40", "09:40"],
        ["9:40", "09:40"],
        ["940", "09:40"],
        ["1415", "14:15"],
        ["9", "09:00"],
    ])('capisce "%s" come %s quando si lascia il campo', async (typed, expected) => {
        render(<Harness initial="08:00" />);

        await userEvent.click(field());
        await userEvent.keyboard(`${typed}{Tab}`);

        expect(field()).toHaveValue(expected);
    });

    it("un orario non valido non cambia il valore", async () => {
        render(<Harness initial="08:00" />);

        await userEvent.click(field());
        await userEvent.keyboard("99{Tab}");

        expect(field()).toHaveValue("08:00");
    });

    it("svuotare il campo lo lascia vuoto", async () => {
        render(<Harness initial="08:00" />);

        await userEvent.click(field());
        await userEvent.keyboard("{Backspace}{Tab}");

        expect(field()).toHaveValue("");
    });

    it("scrivendo filtra l'elenco sulle cifre", async () => {
        render(<Harness />);

        await userEvent.click(field());
        await userEvent.keyboard("14");

        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
            "14:00",
            "14:15",
            "14:30",
            "14:45",
        ]);
    });

    it("frecce e Invio scelgono una voce senza toccare il mouse", async () => {
        render(<Harness initial="09:00" />);

        await userEvent.click(field());
        await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

        expect(field()).toHaveValue("09:30");
    });

    it("Esc scarta quello che si stava scrivendo", async () => {
        render(<Harness initial="09:30" />);

        await userEvent.click(field());
        await userEvent.keyboard("1415{Escape}");
        await userEvent.click(screen.getByRole("button", { name: "Altrove" }));

        expect(field()).toHaveValue("09:30");
    });

    it("la fine parte dopo l'inizio e mostra la durata", async () => {
        render(<Harness initial="11:00" after="10:00" />);

        await userEvent.click(field());

        const options = screen.getAllByRole("option");
        expect(options[0]).toHaveTextContent("10:1515 min");
        expect(options[3]).toHaveTextContent("11:001 h");
        expect(screen.queryByRole("option", { name: /^10:00/ })).not.toBeInTheDocument();
    });

    it("il passo si sceglie: ogni 30 minuti", async () => {
        render(<Harness step={30} />);

        await userEvent.click(field());

        expect(screen.getAllByRole("option")).toHaveLength(48);
    });
});
