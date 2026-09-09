import CustomDialog from "@/components/dialogs/customDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api";
import type { CollaboratorDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

/** I valori che questo dialogo consegna a chi lo apre. */
export type CollaboratorSubmitValues = {
    firstName: string;
    lastName: string;
    phoneNumber: string;
};

type CollaboratorDialogMode = "create" | "edit";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: CollaboratorSubmitValues) => Promise<void> | void;
    mode?: CollaboratorDialogMode;
    initialValues?: CollaboratorDto | null;
};

const CreateCollaboratorDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [formValues, setFormValues] = useState({
        firstName: "",
        lastName: "",
        phoneNumber: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setFormValues({
                    firstName: initialValues?.firstName ?? "",
                    lastName: initialValues?.lastName ?? "",
                    phoneNumber: initialValues?.phoneNumber ?? "",
                });
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        if (formValues.firstName === "") {
            toast.error("Il nome non può essere vuoto");
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
            await onSubmit(formValues);
            onOpenChange(false);
            toast.success(
                mode === "edit" ? "Collaboratore aggiornato con successo" : "Collaboratore creato con successo"
            );
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
            title={mode === "edit" ? "Modifica collaboratore" : "Nuovo collaboratore"}
            description={
                mode === "edit"
                    ? "Aggiorna i dati del collaboratore e conferma per salvare."
                    : "Inserisci i dati del collaboratore e conferma per salvare."
            }
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <div className="grid gap-6">
                    <div className="grid">
                        <Label htmlFor="firstName" className="text-lg">
                            Nome
                        </Label>
                        <Input
                            className="text-lg!"
                            id="firstName"
                            placeholder="Luca"
                            value={formValues.firstName}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, firstName: event.target.value }))}
                        />
                    </div>
                    <div className="grid">
                        <Label htmlFor="lastName" className="text-lg">
                            Cognome
                        </Label>
                        <Input
                            className="text-lg!"
                            id="lastName"
                            placeholder="Neri"
                            value={formValues.lastName}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, lastName: event.target.value }))}
                        />
                    </div>
                    <div className="grid">
                        <Label htmlFor="phoneNumber" className="text-lg">
                            Telefono
                        </Label>
                        <Input
                            className="text-lg!"
                            id="phoneNumber"
                            type="tel"
                            placeholder="333 1234567"
                            value={formValues.phoneNumber}
                            onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, phoneNumber: event.target.value }))
                            }
                        />
                    </div>
                </div>
            }
        />
    );
};

export default CreateCollaboratorDialog;
