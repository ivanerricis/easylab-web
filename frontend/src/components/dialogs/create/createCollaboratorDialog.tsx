import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { fieldProps } from "@/lib/formField";
import { Input } from "@/components/ui/input";
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

type FieldErrors = Partial<Record<"firstName", string>>;

const CreateCollaboratorDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [formValues, setFormValues] = useState({
        firstName: "",
        lastName: "",
        phoneNumber: "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setFormValues({
                    firstName: initialValues?.firstName ?? "",
                    lastName: initialValues?.lastName ?? "",
                    phoneNumber: initialValues?.phoneNumber ?? "",
                });
                setErrors({});
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        if (formValues.firstName.trim() === "") {
            setErrors({ firstName: "Il nome non può essere vuoto" });
            document.getElementById("firstName")?.focus();
            return;
        }

        setErrors({});

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
                    <FormField id="firstName" label="Nome" required error={errors.firstName}>
                        <Input
                            {...fieldProps("firstName", { error: errors.firstName, required: true })}
                            className="text-lg!"
                            // I dati di un'altra persona: il completamento automatico del browser
                            // proporrebbe qui il nome di chi sta al computer, non quello del
                            // collaboratore che si sta inserendo.
                            autoComplete="off"
                            placeholder="Luca"
                            value={formValues.firstName}
                            onChange={(event) => {
                                setFormValues((prev) => ({ ...prev, firstName: event.target.value }));
                                setErrors((prev) => ({ ...prev, firstName: undefined }));
                            }}
                        />
                    </FormField>
                    <FormField id="lastName" label="Cognome">
                        <Input
                            {...fieldProps("lastName")}
                            className="text-lg!"
                            autoComplete="off"
                            placeholder="Neri"
                            value={formValues.lastName}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, lastName: event.target.value }))}
                        />
                    </FormField>
                    <FormField id="phoneNumber" label="Telefono">
                        <Input
                            {...fieldProps("phoneNumber")}
                            className="text-lg!"
                            type="tel"
                            autoComplete="off"
                            placeholder="333 1234567"
                            value={formValues.phoneNumber}
                            onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, phoneNumber: event.target.value }))
                            }
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default CreateCollaboratorDialog;
