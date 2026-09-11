import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { fieldProps } from "@/lib/formField";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import type { IssueDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

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
    const [descriptionError, setDescriptionError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setDescription(initialValues?.description ?? "");
                setDescriptionError(undefined);
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        if (description.trim() === "") {
            setDescriptionError("Inserire una descrizione per il problema");
            document.getElementById("description")?.focus();
            return;
        }

        setDescriptionError(undefined);

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
            confirmIcon={Save}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <FormField id="description" label="Descrizione" required error={descriptionError}>
                    <Textarea
                        {...fieldProps("description", { error: descriptionError, required: true })}
                        className="text-lg!"
                        placeholder="Display rotto"
                        value={description}
                        onChange={(event) => {
                            setDescription(event.target.value);
                            setDescriptionError(undefined);
                        }}
                    />
                </FormField>
            }
        />
    );
};

export default CreateIssueDialog;
