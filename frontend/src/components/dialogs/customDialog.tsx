import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../ui/dialog";
import type { LucideIcon } from "lucide-react";

type Props = Readonly<{
    content?: ReactNode;
    trigger?: ReactNode;
    contentClassName?: string;

    open?: boolean;
    defaultOpen?: boolean;
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
    trigger,
    open,
    defaultOpen,
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
}: Props) => {
    const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

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
        <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={handleOpenChange}>
            {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

            <DialogContent
                className={cn(
                    destructive ? "border! border-destructive!" : "border! border-primary!",
                    contentClassName
                )}
                onPointerDownOutside={(event) => {
                    if (preventOutsideClose) {
                        event.preventDefault();
                    }
                }}
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
                >
                    <DialogHeader>
                        {title ? <DialogTitle className="text-lg">{title}</DialogTitle> : null}
                        {description ? <DialogDescription>{description}</DialogDescription> : null}
                    </DialogHeader>

                    {content}

                    {(showCancelButton || showConfirmButton) && (
                        <DialogFooter className="mt-2">
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
                    <DialogContent className="border! border-destructive! sm:max-w-md" showCloseButton={false}>
                        <DialogHeader>
                            <DialogTitle className="text-lg">Modifiche non salvate</DialogTitle>
                            <DialogDescription>
                                Se chiudi adesso, quello che hai inserito in questa finestra andrà perso.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="mt-2">
                            <Button
                                type="button"
                                size="lg"
                                className="text-lg"
                                variant="outline"
                                // Il pulsante sicuro prende il focus: un Invio di troppo non
                                // deve buttare via il modulo.
                                autoFocus
                                onClick={() => setIsDiscardConfirmOpen(false)}
                            >
                                Continua a modificare
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                className="text-lg"
                                variant="destructive"
                                onClick={handleDiscard}
                            >
                                Chiudi senza salvare
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
};

export default CustomDialog;
