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
import { Save, Trash } from "lucide-react";

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
                                    {destructive ? <Trash className="size-5" /> : <Save className="size-5" />}
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
