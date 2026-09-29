import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState } from "react";
import CustomDialog from "./customDialog";
import { settleDialogHistory } from "@/hooks/useDialogHistoryEntry";
import { renderWithProviders } from "@/test/render";
import { TooltipProvider } from "@/components/ui/tooltip";

const renderDialog = (props: Partial<React.ComponentProps<typeof CustomDialog>> = {}) => {
    const onConfirm = vi.fn();
    renderWithProviders(
        <CustomDialog
            open
            title="Nuovo report"
            onConfirm={onConfirm}
            content={<textarea aria-label="Note" />}
            {...props}
        />
    );
    return onConfirm;
};

describe("CustomDialog: Ctrl+Invio", () => {
    /** L'Invio da solo invia già il modulo, ma non da un'area di testo: lì va a capo. */
    it("conferma da un'area di testo, dove l'Invio va a capo", async () => {
        const onConfirm = renderDialog();

        await userEvent.click(screen.getByLabelText("Note"));
        await userEvent.keyboard("{Enter}");
        expect(onConfirm).not.toHaveBeenCalled();

        await userEvent.keyboard("{Control>}{Enter}{/Control}");
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("non conferma se il pulsante è disabilitato", async () => {
        const onConfirm = renderDialog({ confirmDisabled: true });

        await userEvent.click(screen.getByLabelText("Note"));
        await userEvent.keyboard("{Control>}{Enter}{/Control}");

        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("non conferma quando il dialogo non ha un pulsante di conferma", async () => {
        const onConfirm = renderDialog({ showConfirmButton: false });

        await userEvent.click(screen.getByLabelText("Note"));
        await userEvent.keyboard("{Control>}{Enter}{/Control}");

        expect(onConfirm).not.toHaveBeenCalled();
    });
});

/**
 * Il clic fuori non ha un test qui: né su `CustomDialog` né su un `<Dialog.Root>` Radix nudo
 * (provato a parte) jsdom smette il dialogo con un `pointerdown` simulato, quindi non c'è un
 * modo affidabile di automatizzarlo in questa suite. Il codice tolto (`onPointerDownOutside`)
 * era ridondante con `onInteractOutside`, che Radix chiama comunque anche per il clic fuori —
 * verificato leggendo il sorgente di `@radix-ui/react-dismissable-layer` (vedi il commento in
 * `customDialog.tsx`), non con un test automatico. Il resto del flusso "Modifiche non salvate"
 * (Esc, la X, Annulla) è comunque coperto in `entityDialogs.test.tsx`, e passa dallo stesso
 * `handleOpenChange` che gestirebbe anche il clic fuori.
 */

/**
 * I dialoghi dell'app sono controllati e si aprono da un pulsante qualunque, non da un
 * `DialogTrigger`: Radix alla chiusura non sapeva dove riportare il focus e lo lasciava sul
 * `body`, e chi usa la tastiera ripartiva dall'inizio della pagina.
 */
describe("CustomDialog: focus alla chiusura", () => {
    const Opener = () => {
        const [open, setOpen] = useState(false);

        return (
            <>
                <button type="button" onClick={() => setOpen(true)}>
                    Apri
                </button>
                <CustomDialog
                    open={open}
                    onOpenChange={setOpen}
                    title="Nuovo report"
                    content={<input aria-label="Nome" />}
                />
            </>
        );
    };

    it("torna sul pulsante che ha aperto il dialogo", async () => {
        renderWithProviders(<Opener />);

        await userEvent.click(screen.getByRole("button", { name: "Apri" }));
        expect(await screen.findByRole("dialog")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        await vi.waitFor(() => expect(screen.getByRole("button", { name: "Apri" })).toHaveFocus());
    });
});

/**
 * "Indietro" (Android, il pulsante del mouse, la freccia del browser) con un dialogo aperto
 * portava via dalla pagina, con il modulo aperto e i dati scritti persi. Ora chiude il dialogo,
 * con le stesse regole di Esc; e la voce che il dialogo aggiunge alla cronologia si consuma alla
 * chiusura, così dopo non serve un Indietro in più per lasciare la pagina.
 */
describe("CustomDialog: Indietro chiude il dialogo", () => {
    vi.setConfig({ testTimeout: 20000 });

    const dialogEntries = () => (window.history.state as { dialogEntries?: string[] } | null)?.dialogEntries ?? [];
    const pageMarker = () => (window.history.state as { page?: string } | null)?.page;
    const pressBack = () => act(async () => window.history.back());

    let testCounter = 0;
    let basePage = "";

    beforeEach(async () => {
        // La cronologia di jsdom è condivisa fra i test: si aspetta che le voci dei dialoghi del
        // test prima siano consumate, poi si parte da una voce riconoscibile.
        await new Promise((resolve) => setTimeout(resolve, 50));
        testCounter += 1;
        basePage = `base-${testCounter}`;
        window.history.pushState({ page: basePage }, "");
    });

    const Opener = ({ dirty = false, onClosed }: { dirty?: boolean; onClosed?: () => void }) => {
        const [open, setOpen] = useState(false);

        return (
            <>
                <button type="button" onClick={() => setOpen(true)}>
                    Apri
                </button>
                <CustomDialog
                    open={open}
                    onOpenChange={(nextOpen) => {
                        setOpen(nextOpen);
                        if (!nextOpen) {
                            onClosed?.();
                        }
                    }}
                    isDirty={dirty}
                    title="Nuovo cliente"
                    onCancel={() => setOpen(false)}
                    content={<input aria-label="Nome" />}
                />
            </>
        );
    };

    const openDialog = async () => {
        await userEvent.click(screen.getByRole("button", { name: "Apri" }));
        return screen.findByRole("dialog", { name: "Nuovo cliente" });
    };

    it("all'apertura aggiunge una voce con la stessa pagina, e Indietro chiude il dialogo", async () => {
        renderWithProviders(<Opener />);
        await openDialog();

        expect(dialogEntries()).toHaveLength(1);
        // Lo stato di prima resta: il router, tornando qui o sotto, ritrova la stessa pagina.
        expect(pageMarker()).toBe(basePage);

        await pressBack();

        await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(pageMarker()).toBe(basePage);
        expect(dialogEntries()).toHaveLength(0);
    });

    it("chiuso con Annulla, consuma la propria voce: la cronologia torna com'era", async () => {
        renderWithProviders(<Opener />);
        await openDialog();

        await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

        await vi.waitFor(() => expect(dialogEntries()).toHaveLength(0));
        expect(pageMarker()).toBe(basePage);
    });

    it("con modifiche non salvate chiede prima di chiudere, e la voce si rimette", async () => {
        const onClosed = vi.fn();
        renderWithProviders(<Opener dirty onClosed={onClosed} />);
        await openDialog();

        await pressBack();

        expect(await screen.findByRole("dialog", { name: "Modifiche non salvate" })).toBeInTheDocument();
        expect(onClosed).not.toHaveBeenCalled();
        // La voce è di nuovo in cima: un altro Indietro fa la stessa domanda, non esce dalla pagina.
        await vi.waitFor(() => expect(dialogEntries()).toHaveLength(1));

        await userEvent.click(screen.getByRole("button", { name: "Continua a modificare" }));
        expect(screen.getByRole("dialog", { name: "Nuovo cliente" })).toBeInTheDocument();

        await pressBack();
        await userEvent.click(await screen.findByRole("button", { name: "Chiudi senza salvare" }));

        await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(onClosed).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(dialogEntries()).toHaveLength(0));
        expect(pageMarker()).toBe(basePage);
    });

    it("con la domanda aperta, Indietro vale 'Continua a modificare'", async () => {
        renderWithProviders(<Opener dirty />);
        await openDialog();

        await pressBack();
        expect(await screen.findByRole("dialog", { name: "Modifiche non salvate" })).toBeInTheDocument();

        await pressBack();

        await vi.waitFor(() =>
            expect(screen.queryByRole("dialog", { name: "Modifiche non salvate" })).not.toBeInTheDocument()
        );
        expect(screen.getByRole("dialog", { name: "Nuovo cliente" })).toBeInTheDocument();
        await vi.waitFor(() => expect(dialogEntries()).toHaveLength(1));
    });

    /** Il nuovo cliente creato dal campo del report: Indietro chiude solo quello in primo piano. */
    it("con un dialogo aperto da un altro, Indietro chiude solo quello sopra", async () => {
        const Nested = () => {
            const [outerOpen, setOuterOpen] = useState(true);
            const [innerOpen, setInnerOpen] = useState(false);

            return (
                <CustomDialog
                    open={outerOpen}
                    onOpenChange={setOuterOpen}
                    title="Nuovo report"
                    content={
                        <>
                            <button type="button" onClick={() => setInnerOpen(true)}>
                                Apri cliente
                            </button>
                            <CustomDialog
                                open={innerOpen}
                                onOpenChange={setInnerOpen}
                                title="Nuovo cliente"
                                content={null}
                            />
                        </>
                    }
                />
            );
        };

        renderWithProviders(<Nested />);
        await userEvent.click(await screen.findByRole("button", { name: "Apri cliente" }));
        await screen.findByRole("dialog", { name: "Nuovo cliente" });
        expect(dialogEntries()).toHaveLength(2);

        await pressBack();

        await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Nuovo cliente" })).not.toBeInTheDocument());
        expect(screen.getByRole("dialog", { name: "Nuovo report" })).toBeInTheDocument();
        expect(dialogEntries()).toHaveLength(1);

        await pressBack();

        await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(pageMarker()).toBe(basePage);
    });

    /**
     * Chi chiude e subito naviga (es. dopo il salvataggio verso la scheda appena creata) ha
     * già la sua pagina in cima quando il dialogo consuma la voce: un `back()` a quel punto
     * annullerebbe la navigazione.
     */
    it("non annulla una navigazione fatta subito dopo la chiusura", async () => {
        const CloseAndNavigate = () => {
            const [open, setOpen] = useState(true);

            return (
                <CustomDialog
                    open={open}
                    onOpenChange={setOpen}
                    title="Nuovo report"
                    onConfirm={() => {
                        setOpen(false);
                        window.history.pushState({ page: "scheda-nuova" }, "");
                    }}
                    content={null}
                />
            );
        };

        renderWithProviders(<CloseAndNavigate />);
        await screen.findByRole("dialog");

        await userEvent.click(screen.getByRole("button", { name: "Conferma" }));
        await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

        expect(pageMarker()).toBe("scheda-nuova");
    });

    /** Chi chiude e poi torna indietro (`navigate(-1)`) deve togliere la pagina, non la voce del dialogo. */
    it("con settleDialogHistory, un passo indietro dopo la chiusura lascia davvero la pagina", async () => {
        const CloseAndGoBack = () => {
            const [open, setOpen] = useState(true);

            return (
                <CustomDialog
                    open={open}
                    onOpenChange={setOpen}
                    title="Elimina"
                    onConfirm={async () => {
                        setOpen(false);
                        await settleDialogHistory();
                        window.history.back();
                    }}
                    content={null}
                />
            );
        };

        window.history.pushState({ page: "scheda" }, "");
        renderWithProviders(<CloseAndGoBack />);
        await screen.findByRole("dialog");

        await userEvent.click(screen.getByRole("button", { name: "Conferma" }));

        await vi.waitFor(() => expect(pageMarker()).toBe(basePage));
    });

    /**
     * Lo StrictMode monta, smonta e rimonta gli effetti (solo al montaggio, quindi qui il dialogo
     * nasce già aperto): la voce deve restare una sola.
     */
    it("in StrictMode aggiunge una voce sola, e Annulla la consuma", async () => {
        const OpenFromStart = () => {
            const [open, setOpen] = useState(true);

            return (
                <CustomDialog
                    open={open}
                    onOpenChange={setOpen}
                    title="Nuovo cliente"
                    onCancel={() => setOpen(false)}
                    content={null}
                />
            );
        };

        // `render` nudo con lo StrictMode alla radice: annidato dentro i provider di
        // `renderWithProviders` React non ripete gli effetti, e il test non proverebbe niente
        // (verificato togliendo la ripresa della voce: con i provider passava lo stesso).
        render(
            <StrictMode>
                <TooltipProvider>
                    <OpenFromStart />
                </TooltipProvider>
            </StrictMode>
        );
        await screen.findByRole("dialog");
        await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

        expect(dialogEntries()).toHaveLength(1);
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

        await vi.waitFor(() => expect(dialogEntries()).toHaveLength(0));
        expect(pageMarker()).toBe(basePage);
    });

    it("durante un'operazione in corso Indietro non chiude", async () => {
        const onOpenChange = vi.fn();
        renderWithProviders(
            <CustomDialog open onOpenChange={onOpenChange} title="Elimina" preventOutsideClose content={null} />
        );
        await screen.findByRole("dialog");

        await pressBack();

        await vi.waitFor(() => expect(dialogEntries()).toHaveLength(1));
        expect(onOpenChange).not.toHaveBeenCalled();
    });
});

/** F5 o la chiusura della scheda con un modulo sporco: la domanda del browser. */
describe("CustomDialog: uscita dalla pagina con modifiche non salvate", () => {
    const fireBeforeUnload = () => {
        const event = new Event("beforeunload", { cancelable: true });
        fireEvent(window, event);
        return event.defaultPrevented;
    };

    it("chiede conferma solo se il modulo è sporco", () => {
        const { rerender } = renderWithProviders(
            <CustomDialog open onOpenChange={() => {}} title="Nuovo report" content={null} />
        );
        expect(fireBeforeUnload()).toBe(false);

        rerender(<CustomDialog open isDirty onOpenChange={() => {}} title="Nuovo report" content={null} />);
        expect(fireBeforeUnload()).toBe(true);

        rerender(<CustomDialog open={false} isDirty onOpenChange={() => {}} title="Nuovo report" content={null} />);
        expect(fireBeforeUnload()).toBe(false);
    });
});

/**
 * jsdom non misura, quindi qui si controlla solo lo schema; la misura vera (Nuovo cliente a
 * 360×640, prima da −63 a 703px) si fa nel browser.
 */
describe("CustomDialog: altezza entro lo schermo", () => {
    it("limita il dialogo allo schermo e fa scorrere solo il corpo", async () => {
        renderDialog();
        const dialog = await screen.findByRole("dialog");

        expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]", "flex", "flex-col");
        const body = screen.getByLabelText("Note").parentElement;
        expect(body).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    });
});
