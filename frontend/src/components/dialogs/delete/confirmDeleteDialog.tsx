import { useId, useState } from "react";
import CustomDialog from "@/components/dialogs/customDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash } from "lucide-react";

const deleteConfirmKeyword = "ELIMINA";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    isDeleting?: boolean;
    onConfirm: () => Promise<void> | void;
};

const ConfirmDeleteDialog = ({ open, onOpenChange, title, description, isDeleting = false, onConfirm }: Props) => {
    const confirmInputId = useId();
    const [confirmText, setConfirmText] = useState("");
    const [wasOpen, setWasOpen] = useState(open);

    // Il dialog resta montato tra un'eliminazione e l'altra: senza questo reset la
    // parola digitata la volta precedente sbloccherebbe subito il pulsante. Va fatto
    // in fase di render (non in un effect) perché chi ci usa può chiudere il dialog
    // cambiando lo stato a monte, senza passare da onOpenChange.
    if (open !== wasOpen) {
        setWasOpen(open);
        setConfirmText("");
    }

    return (
        <CustomDialog
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            description={description}
            content={
                <div className="grid gap-2 py-2">
                    {/* `block`: `Label` è un flex con `gap-2`, e il testo attorno a "ELIMINA"
                        diventava tre elementi flessibili, con 8px più lo spazio fra una parola e
                        l'altra (sembrava un doppio spazio). `text-lg` come le etichette degli
                        altri dialoghi, che accompagnano campi a 18px. */}
                    <Label htmlFor={confirmInputId} className="block text-lg leading-snug">
                        Digita <span className="font-semibold">{deleteConfirmKeyword}</span> per confermare
                    </Label>
                    <Input
                        id={confirmInputId}
                        value={confirmText}
                        disabled={isDeleting}
                        onChange={(event) => setConfirmText(event.target.value)}
                        autoComplete="off"
                    />
                </div>
            }
            confirmLabel={isDeleting ? "Eliminazione..." : "Elimina"}
            confirmIcon={Trash}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void onConfirm()}
            cancelDisabled={isDeleting}
            confirmDisabled={isDeleting || confirmText !== deleteConfirmKeyword}
            preventOutsideClose={isDeleting}
            destructive
        />
    );
};

export default ConfirmDeleteDialog;
