import CustomDialog from "@/components/dialogs/customDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import type { IssueDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

/** I valori che questo dialogo consegna a chi lo apre. */
export type IssueSubmitValues = {
    description: string;
};

type IssueDialogMode = "create" | "edit";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: IssueSubmitValues) => Promise<void> | void;
    mode?: IssueDialogMode;
    initialValues?: IssueDto | null;
};

const CreateIssueDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [description, setDescription] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setDescription(initialValues?.description ?? "");
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        if (description === "") {
            toast.error("Inserire una descrizione per il problema");
            return;
        }

        if (isSubmitting) {
            return;
        }

        if (!onSubmit) {
            onOpenChange(false);
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({ description });
            onOpenChange(false);
            toast.success(mode === "edit" ? "Difetto aggiornato con successo" : "Segnalazione creata con successo");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare i dati"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={onOpenChange}
            title={mode === "edit" ? "Modifica difetto" : "Nuovo difetto"}
            description={
                mode === "edit"
                    ? "Aggiorna i dati del difetto e conferma per salvare."
                    : "Inserisci i dati del difetto e conferma per salvare."
            }
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <div className="grid">
                    <Label htmlFor="description" className="text-lg">
                        Descrizione
                    </Label>
                    <Textarea
                        className="text-lg!"
                        id="description"
                        placeholder="Display rotto"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                    />
                </div>
            }
        />
    );
};

export default CreateIssueDialog;
