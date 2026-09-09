import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { fieldProps } from "@/lib/formField";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import type { CustomerDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

/** I valori che questo dialogo consegna a chi lo apre. */
export type CustomerSubmitValues = {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    phoneNumberSecondary: string;
    email: string;
    city: string;
};

type CustomerDialogMode = "create" | "edit";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: CustomerSubmitValues) => Promise<void> | void;
    mode?: CustomerDialogMode;
    initialValues?: CustomerDto | null;
};

type FieldErrors = Partial<Record<"firstName" | "phoneNumber", string>>;

const CreateCustomerDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [formValues, setFormValues] = useState({
        firstName: "",
        lastName: "",
        phoneNumber: "",
        phoneNumberSecondary: "",
        email: "",
        city: "",
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
                    phoneNumberSecondary: initialValues?.phoneNumberSecondary ?? "",
                    email: initialValues?.email ?? "",
                    city: initialValues?.city ?? "",
                });
                setErrors({});
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        const nextErrors: FieldErrors = {};

        if (formValues.firstName.trim() === "") {
            nextErrors.firstName = "Il nome non può essere vuoto";
        }

        if (formValues.phoneNumber.trim() === "" && formValues.phoneNumberSecondary.trim() === "") {
            // La regola riguarda due campi insieme, quindi il messaggio va sul primo dei due:
            // è quello su cui si posa il focus e quello che di norma si compila.
            nextErrors.phoneNumber = "Serve almeno un numero di telefono, il primo o il secondo";
        }

        setErrors(nextErrors);

        const firstInvalidField = (["firstName", "phoneNumber"] as const).find((field) => nextErrors[field]);

        if (firstInvalidField) {
            document.getElementById(firstInvalidField)?.focus();
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
            toast.success(mode === "edit" ? "Cliente aggiornato con successo" : "Cliente creato con successo");
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
            title={mode === "edit" ? "Modifica cliente" : "Nuovo cliente"}
            description={
                mode === "edit"
                    ? "Aggiorna i dati del cliente e conferma per salvare."
                    : "Inserisci i dati del cliente e conferma per salvare."
            }
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <div className="grid gap-6">
                    <FormField id="firstName" label="Nome (Nome azienda)" required error={errors.firstName}>
                        <Input
                            {...fieldProps("firstName", { error: errors.firstName, required: true })}
                            className="text-lg!"
                            autoComplete="off"
                            placeholder="Mario"
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
                            placeholder="Rossi"
                            value={formValues.lastName}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, lastName: event.target.value }))}
                        />
                    </FormField>
                    <FormField id="phoneNumber" label="Telefono 1" required error={errors.phoneNumber}>
                        <Input
                            {...fieldProps("phoneNumber", { error: errors.phoneNumber, required: true })}
                            className="text-lg!"
                            type="tel"
                            autoComplete="off"
                            placeholder="333 1234567"
                            value={formValues.phoneNumber}
                            onChange={(event) => {
                                setFormValues((prev) => ({ ...prev, phoneNumber: event.target.value }));
                                setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
                            }}
                        />
                    </FormField>
                    <FormField id="phoneNumberSecondary" label="Telefono 2">
                        <Input
                            {...fieldProps("phoneNumberSecondary")}
                            className="text-lg!"
                            type="tel"
                            autoComplete="off"
                            placeholder="333 9876543"
                            value={formValues.phoneNumberSecondary}
                            onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, phoneNumberSecondary: event.target.value }))
                            }
                        />
                    </FormField>
                    <FormField id="email" label="Email">
                        <Input
                            {...fieldProps("email")}
                            className="text-lg!"
                            type="email"
                            autoComplete="off"
                            placeholder="mario.rossi@email.com"
                            value={formValues.email}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, email: event.target.value }))}
                        />
                    </FormField>
                    <FormField id="city" label="Località">
                        <Input
                            {...fieldProps("city")}
                            className="text-lg!"
                            autoComplete="off"
                            placeholder="Roma"
                            value={formValues.city}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, city: event.target.value }))}
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default CreateCustomerDialog;
