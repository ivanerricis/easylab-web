import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { fieldProps } from "@/lib/formField";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import type { DeviceDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

/** I valori che questo dialogo consegna a chi lo apre. */
export type DeviceSubmitValues = {
    name: string;
};

type DeviceDialogMode = "create" | "edit";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: DeviceSubmitValues) => Promise<void> | void;
    mode?: DeviceDialogMode;
    initialValues?: DeviceDto | null;
};

const CreateDeviceDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [name, setName] = useState("");
    const [nameError, setNameError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setName(initialValues?.name ?? "");
                setNameError(undefined);
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        if (name.trim() === "") {
            setNameError("Il nome del dispositivo non può essere vuoto");
            document.getElementById("name")?.focus();
            return;
        }

        setNameError(undefined);

        if (isSubmitting) {
            return;
        }

        if (!onSubmit) {
            onOpenChange(false);
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({ name });
            onOpenChange(false);
            toast.success(mode === "edit" ? "Dispositivo aggiornato con successo" : "Dispositivo creato con successo");
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
            title={mode === "edit" ? "Modifica dispositivo" : "Nuovo dispositivo"}
            description={
                mode === "edit"
                    ? "Aggiorna i dati del dispositivo e conferma per salvare."
                    : "Inserisci i dati del dispositivo e conferma per salvare."
            }
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <FormField id="name" label="Nome dispositivo" required error={nameError}>
                    <Input
                        {...fieldProps("name", { error: nameError, required: true })}
                        className="text-lg!"
                        placeholder="iPhone 13"
                        value={name}
                        onChange={(event) => {
                            setName(event.target.value);
                            setNameError(undefined);
                        }}
                    />
                </FormField>
            }
        />
    );
};

export default CreateDeviceDialog;
