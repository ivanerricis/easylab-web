import type { ReactNode } from "react";
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
    contentClassName,
}: Props) => {
    return (
        <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
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
                <form
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
            </DialogContent>
        </Dialog>
    );
};

export default CustomDialog;
