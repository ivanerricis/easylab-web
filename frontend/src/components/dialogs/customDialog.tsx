import { useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import type { LucideIcon } from "lucide-react";

type Props = Readonly<{
    content?: ReactNode;
    contentClassName?: string;
    /** Classi in più per la riga dei pulsanti (es. affiancati anche su mobile, nei moduli a passi). */
    footerClassName?: string;

    open?: boolean;
    onOpenChange?: (open: boolean) => void;

    title?: ReactNode;
    description?: ReactNode;

    cancelLabel?: ReactNode;
    confirmLabel?: ReactNode;
    /**
     * L'icona del pulsante di conferma, come componente (`confirmIcon={Save}`): la misura la
     * decide questo dialogo, uguale per tutti.
     *
     * Senza, il pulsante non ha icona. Prima il default era il floppy di "Salva", o il cestino
     * con `destructive`: giusti per i moduli e per "Elimina", ma finivano anche su "Invia"
     * (che manda un'email al cliente), "Attiva", "Aggiorna adesso", "Ripristina", "Disabilita"
     * — l'icona prometteva un'azione e il pulsante ne faceva un'altra. Con il default vuoto un
     * dialogo nuovo può al più non avere icona, non averne una sbagliata.
     */
    confirmIcon?: LucideIcon;

    onCancel?: () => void;
    onConfirm?: () => void;

    cancelDisabled?: boolean;
    confirmDisabled?: boolean;

    showCancelButton?: boolean;
    showConfirmButton?: boolean;

    destructive?: boolean;
    preventOutsideClose?: boolean;
    /**
     * Il modulo ha modifiche non salvate. In quel caso Esc, la X e il clic fuori non chiudono
     * subito: prima chiedono se buttare via quello che si è scritto.
     *
     * "Annulla" invece chiude senza chiedere, perché è già una scelta esplicita di rinunciare;
     * anche la chiusura dopo un salvataggio riuscito non passa di qui, perché i dialoghi la
     * fanno chiamando direttamente il proprio `onOpenChange(false)`. La domanda serve per i
     * gesti che si fanno per sbaglio: un Esc di troppo su un report da venti campi.
     */
    isDirty?: boolean;
}>;

const CustomDialog = ({
    content,
    open,
    onOpenChange,
    title,
    description,
    cancelLabel = "Annulla",
    confirmLabel = "Conferma",
    confirmIcon: ConfirmIcon,
    onCancel,
    onConfirm,
    cancelDisabled = false,
    confirmDisabled = false,
    showCancelButton = true,
    showConfirmButton = true,
    destructive = false,
    preventOutsideClose = false,
    isDirty = false,
    contentClassName,
    footerClassName,
}: Props) => {
    const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
    const keepEditingButtonRef = useRef<HTMLButtonElement>(null);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && isDirty) {
            setIsDiscardConfirmOpen(true);
            return;
        }

        onOpenChange?.(nextOpen);
    };

    const handleDiscard = () => {
        setIsDiscardConfirmOpen(false);
        onOpenChange?.(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className={cn(
                    // Il testo dei campi (`Input`, `Textarea`) è più grande qui che nel resto
                    // dell'app: deciso una volta sola qui, non più a ogni campo. Prima ogni
                    // dialogo doveva ricordarsi un `text-lg!` per campo — un campo nuovo che se
                    // lo dimenticava usciva più piccolo dei suoi vicini. `**:` perché i campi non
                    // sono figli diretti di `DialogContent`, ma annidati dentro `FormField`,
                    // `EuroInput` e simili; `!` per vincere `md:text-sm`, che l'`Input` di base
                    // applica da `md` in su. Lo stesso per il trigger dei `Select`: era `text-lg`
                    // di suo, ma ora segue `Input` (`md:text-sm`) per stare alla pari del campo di
                    // ricerca nelle barre dei filtri, e nei dialoghi va riportato alla misura dei
                    // campi accanto.
                    "**:data-[slot=input]:text-lg! **:data-[slot=select-trigger]:text-lg! **:data-[slot=textarea]:text-lg!",
                    destructive ? "border! border-destructive!" : "border! border-primary!",
                    contentClassName
                )}
                // Copre anche il clic fuori: Radix chiama `onInteractOutside` pure per quello,
                // subito dopo `onPointerDownOutside`, sullo stesso evento (vedi
                // `usePointerDownOutside` in `@radix-ui/react-dismissable-layer`), quindi un
                // secondo gestore solo per quel caso ripeteva la stessa regola di
                // `preventOutsideClose` con lo stesso risultato. Verificato leggendo il
                // sorgente della libreria, non con un test: jsdom non simula un vero clic fuori
                // dal dialogo (nemmeno un `<Dialog.Root>` Radix nudo lo smette in test), quindi
                // qui non c'è un modo affidabile di provarlo automaticamente.
                onInteractOutside={(event) => {
                    if (preventOutsideClose) {
                        event.preventDefault();
                        return;
                    }

                    const target = event.target;

                    if (target instanceof HTMLElement && target.closest('[data-slot="select-content"]')) {
                        event.preventDefault();
                    }
                }}
            >
                {/*
                    `noValidate`: i dialoghi controllano i campi da sé e mostrano l'errore sotto
                    quello sbagliato, tutti insieme e con il focus sul primo. Senza, la validazione
                    nativa del browser partiva prima — un `required` vuoto o un `min` violato
                    bloccavano l'invio con il fumetto "Compila questo campo" — e i messaggi
                    scritti per quei casi non comparivano mai.
                */}
                <form
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        onConfirm?.();
                    }}
                    onKeyDown={(event) => {
                        // Ctrl+Invio (⌘+Invio su Mac) conferma da qualunque campo. L'Invio da solo
                        // già invia il modulo, ma non dalle aree di testo — Note, descrizioni —
                        // dove va a capo, ed è proprio lì che si finisce di compilare.
                        if (
                            (event.ctrlKey || event.metaKey) &&
                            event.key === "Enter" &&
                            showConfirmButton &&
                            !confirmDisabled
                        ) {
                            event.preventDefault();
                            onConfirm?.();
                        }
                    }}
                >
                    <DialogHeader>
                        {title ? <DialogTitle className="text-lg font-semibold">{title}</DialogTitle> : null}
                        {description ? <DialogDescription>{description}</DialogDescription> : null}
                    </DialogHeader>

                    {content}

                    {(showCancelButton || showConfirmButton) && (
                        <DialogFooter className={cn("mt-2", footerClassName)}>
                            {showCancelButton && (
                                <Button
                                    type="button"
                                    size={"lg"}
                                    className="text-lg"
                                    variant="outline"
                                    onClick={onCancel}
                                    disabled={cancelDisabled}
                                >
                                    {cancelLabel}
                                </Button>
                            )}

                            {showConfirmButton && (
                                <Button
                                    type="submit"
                                    size={"lg"}
                                    variant={destructive ? "destructive" : "default"}
                                    disabled={confirmDisabled}
                                >
                                    {ConfirmIcon ? <ConfirmIcon className="size-5" /> : null}
                                    <span className="text-lg">{confirmLabel}</span>
                                </Button>
                            )}
                        </DialogFooter>
                    )}
                </form>

                {/* Annidato nel dialogo del modulo, non accanto: Radix gestisce così lo
                    strato sopra lo strato, e Esc chiude solo questa domanda. */}
                <Dialog open={isDiscardConfirmOpen} onOpenChange={setIsDiscardConfirmOpen}>
                    {/* `sm:max-w-lg`, non `md`: i due pulsanti affiancati vogliono 419px, più dei
                        398px che restano dentro un `max-w-md` tolti bordo e padding. Essendo
                        `shrink-0` e `whitespace-nowrap` non si stringevano — allargavano invece la
                        colonna della griglia (le celle nascono `min-width: auto`), e header e
                        footer sbordavano nel padding destro: 25px di margine a sinistra, 4 a
                        destra. */}
                    <DialogContent
                        className="border! border-destructive! sm:max-w-lg"
                        showCloseButton={false}
                        // Il focus va al pulsante sicuro, che nel markup sta per ultimo: Radix
                        // all'apertura mette a fuoco il primo elemento focalizzabile e ignora
                        // `autoFocus`, quindi senza questo toccava a "Chiudi senza salvare" — e un
                        // Invio di troppo avrebbe buttato via il modulo.
                        onOpenAutoFocus={(event) => {
                            event.preventDefault();
                            keepEditingButtonRef.current?.focus();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle className="text-lg font-semibold">Modifiche non salvate</DialogTitle>
                            <DialogDescription>
                                Se chiudi adesso, quello che hai inserito in questa finestra andrà perso.
                            </DialogDescription>
                        </DialogHeader>
                        {/* L'azione consigliata è quella sicura, quindi è lei il pulsante pieno:
                            prima era grigia (`outline`) accanto a un "Chiudi senza salvare" colorato,
                            e a colpo d'occhio sembrava più importante l'azione che butta via il
                            lavoro. Nel markup sta per ultima, come il "Salva" dei moduli: col footer
                            di serie finisce a destra da `sm` in su e in cima sotto `sm` (dove il
                            footer è `flex-col-reverse`), cioè dove l'app mette sempre l'azione
                            principale. */}
                        <DialogFooter className="mt-2">
                            <Button
                                type="button"
                                size="lg"
                                className="text-lg"
                                variant="destructive"
                                onClick={handleDiscard}
                            >
                                Chiudi senza salvare
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                className="text-lg"
                                ref={keepEditingButtonRef}
                                onClick={() => setIsDiscardConfirmOpen(false)}
                            >
                                Continua a modificare
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
};

export default CustomDialog;
