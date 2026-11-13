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

    /** Una cifra sola è l'ora: "1" propone 01:xx e 10-19, ma non 21:xx o 02:xx. */
    it("con una cifra propone le ore che iniziano per quella cifra, con e senza lo zero davanti", async () => {
        render(<Harness />);

        await userEvent.click(field());
        await userEvent.keyboard("1");

        const times = screen.getAllByRole("option").map((option) => option.textContent);
        expect(times).toContain("01:00");
        expect(times).toContain("10:00");
        expect(times).toContain("19:45");
        expect(times).not.toContain("02:00");
        expect(times).not.toContain("21:00");
    });

    it("con tre cifre in poi legge l'orario senza lo zero davanti", async () => {
        render(<Harness />);

        await userEvent.click(field());
        await userEvent.keyboard("93");

        // 93 non è un'ora: si cerca fra le cifre dell'orario, quindi 09:30 ("930").
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["09:30"]);
    });

    it("un orario scritto che non è nell'elenco si conferma con Invio", async () => {
        render(<Harness initial="08:00" />);

        await userEvent.click(field());
        await userEvent.keyboard("941");

        expect(screen.queryByRole("option")).not.toBeInTheDocument();
        expect(screen.getByText("Premi Invio per usare l'orario scritto")).toBeInTheDocument();
        await userEvent.keyboard("{Enter}");

        expect(field()).toHaveValue("09:41");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("un orario scritto per intero vince sulla voce evidenziata", async () => {
        render(<Harness initial="08:00" />);

        await userEvent.click(field());
        await userEvent.keyboard("1415{Enter}");

        expect(field()).toHaveValue("14:15");
    });

    it("con Invio su un orario non valido chiude l'elenco e tiene il valore di prima", async () => {
        render(<Harness initial="08:00" />);

        await userEvent.click(field());
        await userEvent.keyboard("99{Enter}");

        expect(field()).toHaveValue("08:00");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("la freccia in su apre l'elenco e poi sale di una voce; si ferma alla prima", async () => {
        render(<Harness initial="09:00" />);

        // Il campo si apre da solo al clic: si chiude con Esc per provare la freccia da chiuso.
        await userEvent.click(field());
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

        await userEvent.keyboard("{ArrowUp}");
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(field()).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-09:00$/));

        await userEvent.keyboard("{ArrowUp}");
        expect(field()).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-08:45$/));
        await userEvent.keyboard("{ArrowUp}".repeat(40));
        expect(field()).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-00:00$/));
        await userEvent.keyboard("{Enter}");

        expect(field()).toHaveValue("00:00");
    });

    it("passando il mouse su una voce la evidenzia, e Invio sceglie quella", async () => {
        render(<Harness initial="09:00" />);

        await userEvent.click(field());
        await userEvent.hover(screen.getByRole("option", { name: "12:30" }));
        await userEvent.keyboard("{Enter}");

        expect(field()).toHaveValue("12:30");
    });

    it("Invio su un orario in un form non invia il form", async () => {
        const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
        render(
            <form onSubmit={onSubmit}>
                <Harness initial="09:00" />
            </form>
        );

        await userEvent.click(field());
        await userEvent.keyboard("{ArrowDown}{Enter}");

        expect(field()).toHaveValue("09:15");
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("un campo disabilitato non apre l'elenco", async () => {
        render(<TimeField id="t" value="09:00" onValueChange={vi.fn()} disabled aria-label="Orario" />);

        await userEvent.click(screen.getByRole("combobox"));

        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("per un campo fine, scrivendo, la durata resta riferita all'inizio", async () => {
        render(<Harness initial="10:30" after="10:00" />);

        await userEvent.click(field());
        await userEvent.keyboard("11");

        const options = screen.getAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual([
            "11:001 h",
            "11:151 h 15 min",
            "11:301 h 30 min",
            "11:451 h 45 min",
        ]);
    });
});
