import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InputWithAdd from "./inputWithAdd";

type HarnessProps = Omit<Parameters<typeof InputWithAdd>[0], "value" | "onChange" | "id"> & {
    initialValue?: string;
    onChange?: (value: string) => void;
};

const Harness = ({ initialValue = "", onChange, ...props }: HarnessProps) => {
    const [value, setValue] = useState(initialValue);
    return (
        <InputWithAdd
            id="issue"
            value={value}
            onChange={(next) => {
                setValue(next);
                onChange?.(next);
            }}
            {...props}
        />
    );
};

const issues = ["Schermo rotto", "Batteria gonfia", "Altro", "Schermo nero"];

const suggestionNames = () =>
    screen
        .queryAllByRole("button")
        .map((button) => button.textContent)
        .filter(Boolean);

afterEach(() => {
    vi.useRealTimers();
});

describe("InputWithAdd", () => {
    /** Un elenco già aperto all'apertura del dialogo coprirebbe il resto del modulo. */
    it("non mostra suggerimenti a campo vuoto", async () => {
        render(<Harness options={issues} />);

        await userEvent.click(screen.getByRole("textbox"));

        expect(suggestionNames()).toEqual([]);
    });

    it("con showAllOnFocus srotola tutto il catalogo al focus", async () => {
        render(<Harness options={issues} showAllOnFocus />);

        await userEvent.click(screen.getByRole("textbox"));

        expect(suggestionNames()).toEqual(issues);
    });

    it("filtra le opzioni senza badare alle maiuscole e propone di crearne una nuova", async () => {
        render(<Harness options={issues} onCreate={vi.fn()} />);

        await userEvent.type(screen.getByRole("textbox"), "SCHERMO");

        expect(suggestionNames()).toEqual(["Schermo rotto", "Schermo nero", 'Crea "SCHERMO"']);
    });

    it("non propone di creare un valore che esiste già", async () => {
        render(<Harness options={issues} onCreate={vi.fn()} />);

        await userEvent.type(screen.getByRole("textbox"), "altro");

        expect(suggestionNames()).toEqual(["Altro"]);
    });

    it("sceglie un suggerimento", async () => {
        const onChange = vi.fn();
        render(<Harness options={issues} onChange={onChange} />);

        await userEvent.type(screen.getByRole("textbox"), "batt");
        fireEvent.mouseDown(screen.getByRole("button", { name: "Batteria gonfia" }));

        expect(screen.getByRole("textbox")).toHaveValue("Batteria gonfia");
        expect(suggestionNames()).toEqual([]);
    });

    it("crea il valore ripulito dagli spazi e lo mette nel campo", async () => {
        const onCreate = vi.fn().mockResolvedValue(undefined);
        render(<Harness options={issues} onCreate={onCreate} />);

        await userEvent.type(screen.getByRole("textbox"), "  Tastiera  ");
        await act(async () => {
            fireEvent.mouseDown(screen.getByRole("button", { name: 'Crea "Tastiera"' }));
        });

        expect(onCreate).toHaveBeenCalledWith("Tastiera");
        expect(screen.getByRole("textbox")).toHaveValue("Tastiera");
    });

    it("senza onCreate l'ultima voce dice 'Usa' e non crea nulla", async () => {
        render(<Harness options={issues} />);

        await userEvent.type(screen.getByRole("textbox"), "Tastiera");

        expect(screen.getByRole("button", { name: 'Usa "Tastiera"' })).toBeInTheDocument();
    });

    it("con onSearch chiede i risultati al server dopo la pausa e non propone di crearne", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const onSearch = vi.fn().mockResolvedValue(["Mario Rossi - 333"]);
        render(<Harness onSearch={onSearch} />);

        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.type(screen.getByRole("textbox"), "mar");
        expect(onSearch).not.toHaveBeenCalled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });

        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onSearch).toHaveBeenCalledWith("mar");
        expect(suggestionNames()).toEqual(["Mario Rossi - 333"]);
    });

    it("chiude i suggerimenti quando il campo perde il focus", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        render(
            <>
                <Harness options={issues} />
                <button>altro controllo</button>
            </>
        );
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        await user.type(screen.getByRole("textbox"), "schermo");
        expect(suggestionNames()).toContain("Schermo rotto");

        fireEvent.blur(screen.getByRole("textbox"));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });

        expect(suggestionNames()).toEqual(["altro controllo"]);
    });
});
