import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InputWithAdd from "./inputWithAdd";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

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
        .queryAllByRole("option")
        .map((option) => option.textContent)
        .filter(Boolean);

const field = () => screen.getByRole("combobox");

afterEach(() => {
    vi.useRealTimers();
});

describe("InputWithAdd", () => {
    /** Un elenco già aperto all'apertura del dialogo coprirebbe il resto del modulo. */
    it("non mostra suggerimenti a campo vuoto", async () => {
        render(<Harness options={issues} />);

        await userEvent.click(field());

        expect(suggestionNames()).toEqual([]);
    });

    it("con showAllOnFocus srotola tutto il catalogo al focus", async () => {
        render(<Harness options={issues} showAllOnFocus />);

        await userEvent.click(field());

        expect(suggestionNames()).toEqual(issues);
    });

    it("filtra le opzioni senza badare alle maiuscole e propone di crearne una nuova", async () => {
        render(<Harness options={issues} onCreate={vi.fn()} />);

        await userEvent.type(field(), "SCHERMO");

        expect(suggestionNames()).toEqual(["Schermo rotto", "Schermo nero", 'Crea "SCHERMO"']);
    });

    it("non propone di creare un valore che esiste già", async () => {
        render(<Harness options={issues} onCreate={vi.fn()} />);

        await userEvent.type(field(), "altro");

        expect(suggestionNames()).toEqual(["Altro"]);
    });

    it("sceglie un suggerimento", async () => {
        const onChange = vi.fn();
        render(<Harness options={issues} onChange={onChange} />);

        await userEvent.type(field(), "batt");
        await userEvent.click(screen.getByRole("option", { name: "Batteria gonfia" }));

        expect(field()).toHaveValue("Batteria gonfia");
        expect(suggestionNames()).toEqual([]);
    });

    it("crea il valore ripulito dagli spazi e lo mette nel campo", async () => {
        const onCreate = vi.fn().mockResolvedValue(undefined);
        render(<Harness options={issues} onCreate={onCreate} />);

        await userEvent.type(field(), "  Tastiera  ");
        await act(async () => {
            fireEvent.click(screen.getByRole("option", { name: 'Crea "Tastiera"' }));
        });

        expect(onCreate).toHaveBeenCalledWith("Tastiera");
        expect(field()).toHaveValue("Tastiera");
    });

    /**
     * Nessun chiamante oggi passa `options` senza `onCreate` (i due usi senza `onSearch`,
     * dispositivi e difetti, lo passano sempre): il pulsante mostra sempre "Crea ...". Il
     * controllo `onCreate` in `handleCreate` resta comunque, a difesa di un chiamante futuro
     * che lo dimentichi — non deve mai lanciare, deve solo chiudere il menu senza creare nulla.
     */
    it("senza onCreate il pulsante di creazione non lancia, e chiude il menu senza creare nulla", async () => {
        render(<Harness options={issues} />);

        await userEvent.type(field(), "Tastiera");

        const createButton = screen.getByRole("option", { name: 'Crea "Tastiera"' });
        await userEvent.click(createButton);

        expect(createButton).not.toBeInTheDocument();
    });

    it("con onSearch chiede i risultati al server dopo la pausa e non propone di crearne", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const onSearch = vi.fn().mockResolvedValue(["Mario Rossi - 333"]);
        render(<Harness onSearch={onSearch} />);

        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.type(field(), "mar");
        expect(onSearch).not.toHaveBeenCalled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });

        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onSearch).toHaveBeenCalledWith("mar", expect.any(AbortSignal));
        expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label"))).toEqual([
            "Mario Rossi - 333",
        ]);
    });

    /**
     * La voce del cliente si mostra su due righe, nome e telefono, perché andando a capo come
     * testo il numero si spezzava a metà. Il valore scelto resta la stringa intera: è la chiave
     * con cui il dialogo ritrova l'id del cliente.
     */
    it("mostra nome e telefono del cliente su due righe, ma sceglie la voce intera", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const onChange = vi.fn();
        const onSearch = vi.fn().mockResolvedValue(["Nicola Longo - +39 3438880123"]);
        render(<Harness onSearch={onSearch} onChange={onChange} />);

        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.type(field(), "nic");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });

        const option = screen.getByRole("option", { name: "Nicola Longo - +39 3438880123" });
        expect(screen.getByText("Nicola Longo")).toBeInTheDocument();
        expect(screen.getByText("+39 3438880123")).toHaveClass("whitespace-nowrap");

        await user.click(option);
        expect(onChange).toHaveBeenLastCalledWith("Nicola Longo - +39 3438880123");
    });

    it("non divide le voci dei cataloghi, anche con un trattino", async () => {
        render(<Harness options={["Schermo - vetro rotto"]} />);

        await userEvent.type(field(), "schermo");

        expect(screen.getByRole("option", { name: "Schermo - vetro rotto" })).not.toHaveAttribute("aria-label");
    });

    /**
     * Q10: scelto un suggerimento, `value` diventa l'etichetta intera ("Mario Rossi - 333...")
     * e prima, dopo 250ms, partiva comunque una ricerca inutile con quel testo — la stessa cosa
     * succedeva aprendo un dialogo con il cliente già scelto in partenza. `isSelectedOption`
     * dice al campo che il testo attuale non è (più) da cercare.
     */
    it("con isSelectedOption non cerca: il valore è già un'opzione scelta, non testo da cercare", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const onSearch = vi.fn().mockResolvedValue(["Mario Rossi - 333"]);
        render(<Harness onSearch={onSearch} isSelectedOption initialValue="Mario Rossi - 333" />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });

        expect(onSearch).not.toHaveBeenCalled();
    });

    it("annulla la ricerca superata invece di limitarsi a scartarne la risposta", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const onSearch = vi.fn().mockImplementation((_query: string, signal: AbortSignal) => {
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new Error("annullata")));
            });
        });
        render(<Harness onSearch={onSearch} />);

        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.type(field(), "ma");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });
        expect(onSearch).toHaveBeenCalledTimes(1);
        const firstSignal = onSearch.mock.calls[0][1] as AbortSignal;
        expect(firstSignal.aborted).toBe(false);

        await user.type(field(), "rio");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(250);
        });

        expect(firstSignal.aborted).toBe(true);
    });

    /** Senza più il `setTimeout` di 100ms: la lista si chiude appena il focus esce. */
    it("chiude i suggerimenti quando il campo perde il focus", async () => {
        render(
            <>
                <Harness options={issues} />
                <button>altro controllo</button>
            </>
        );

        await userEvent.type(field(), "schermo");
        expect(suggestionNames()).toContain("Schermo rotto");

        await userEvent.tab();

        expect(screen.getByRole("button", { name: "altro controllo" })).toHaveFocus();
        expect(suggestionNames()).toEqual([]);
        expect(field()).toHaveAttribute("aria-expanded", "false");
    });

    /**
     * Il `mousedown` sulla voce è trattenuto: il focus resta sul campo, e la lista non si chiude
     * prima del `click` (quello che genera anche il tocco su telefono) che sceglie.
     */
    it("il mousedown su una voce non toglie il focus al campo", async () => {
        render(<Harness options={issues} />);

        await userEvent.type(field(), "batt");
        const option = screen.getByRole("option", { name: "Batteria gonfia" });

        expect(fireEvent.mouseDown(option)).toBe(false);
        expect(field()).toHaveFocus();
        expect(suggestionNames()).toEqual(["Batteria gonfia", 'Crea "batt"']);
    });

    describe("da tastiera (schema combobox)", () => {
        it("collega il campo alla lista con i ruoli e gli attributi ARIA", async () => {
            render(<Harness options={issues} />);

            expect(field()).toHaveAttribute("aria-expanded", "false");
            expect(field()).toHaveAttribute("aria-autocomplete", "list");
            expect(field()).not.toHaveAttribute("aria-controls");

            await userEvent.type(field(), "schermo");

            const listbox = screen.getByRole("listbox");
            expect(field()).toHaveAttribute("aria-expanded", "true");
            expect(field()).toHaveAttribute("aria-controls", listbox.id);
            expect(field()).not.toHaveAttribute("aria-activedescendant");
            expect(screen.getByText("2 suggerimenti")).toBeInTheDocument();
        });

        it('le frecce scorrono le voci, "Crea …" compresa, e girano in tondo', async () => {
            render(<Harness options={issues} onCreate={vi.fn()} />);
            await userEvent.type(field(), "schermo");

            const activeName = () =>
                document.getElementById(field().getAttribute("aria-activedescendant") ?? "")?.textContent;

            await userEvent.keyboard("{ArrowDown}");
            expect(activeName()).toBe("Schermo rotto");
            expect(screen.getByRole("option", { name: "Schermo rotto" })).toHaveAttribute("aria-selected", "true");

            await userEvent.keyboard("{ArrowDown}{ArrowDown}");
            expect(activeName()).toBe('Crea "schermo"');

            await userEvent.keyboard("{ArrowDown}");
            expect(activeName()).toBe("Schermo rotto");

            await userEvent.keyboard("{ArrowUp}");
            expect(activeName()).toBe('Crea "schermo"');
        });

        it("Invio sceglie la voce evidenziata senza inviare il modulo", async () => {
            const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
            render(
                <form onSubmit={onSubmit}>
                    <Harness options={issues} />
                </form>
            );

            await userEvent.type(field(), "schermo");
            await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

            expect(field()).toHaveValue("Schermo nero");
            expect(field()).toHaveFocus();
            expect(suggestionNames()).toEqual([]);
            expect(onSubmit).not.toHaveBeenCalled();
        });

        it("Invio senza voce evidenziata invia il modulo come negli altri campi", async () => {
            const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
            render(
                <form onSubmit={onSubmit}>
                    <Harness options={issues} />
                    <button type="submit">Salva</button>
                </form>
            );

            await userEvent.type(field(), "schermo{Enter}");

            expect(onSubmit).toHaveBeenCalledTimes(1);
            expect(field()).toHaveValue("schermo");
        });

        it('Invio su "Crea …" crea il valore', async () => {
            const onCreate = vi.fn().mockResolvedValue(undefined);
            render(<Harness options={issues} onCreate={onCreate} />);

            await userEvent.type(field(), "Tastiera");
            await userEvent.keyboard("{ArrowUp}");
            await act(async () => {
                await userEvent.keyboard("{Enter}");
            });

            expect(onCreate).toHaveBeenCalledWith("Tastiera");
            expect(suggestionNames()).toEqual([]);
        });

        it("freccia giù riapre la lista chiusa", async () => {
            render(<Harness options={issues} />);

            await userEvent.type(field(), "schermo{Escape}");
            expect(suggestionNames()).toEqual([]);

            await userEvent.keyboard("{ArrowDown}");
            expect(suggestionNames()).toEqual(["Schermo rotto", "Schermo nero", 'Crea "schermo"']);
        });

        /**
         * Radix ascolta Esc su `document` in cattura: il primo Esc deve chiudere solo la lista,
         * il secondo (a lista chiusa) il dialogo come sempre.
         */
        it("Esc chiude prima la lista e solo al secondo colpo il dialogo", async () => {
            const onOpenChange = vi.fn();
            render(
                <Dialog open onOpenChange={onOpenChange}>
                    <DialogContent aria-describedby={undefined} showCloseButton={false}>
                        <DialogTitle>Nuovo report</DialogTitle>
                        <Harness options={issues} />
                    </DialogContent>
                </Dialog>
            );

            await userEvent.type(field(), "schermo");
            expect(suggestionNames()).not.toEqual([]);

            await userEvent.keyboard("{Escape}");
            expect(suggestionNames()).toEqual([]);
            expect(onOpenChange).not.toHaveBeenCalled();

            await userEvent.keyboard("{Escape}");
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
    });
});
