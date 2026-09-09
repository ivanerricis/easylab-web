import CustomDialog from "@/components/dialogs/customDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const CreateCustomerDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [formValues, setFormValues] = useState({
        firstName: "",
        lastName: "",
        phoneNumber: "",
        phoneNumberSecondary: "",
        email: "",
        city: "",
    });
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
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        if (formValues.firstName === "") {
            toast.error("Il nome non può essere vuoto");
            return;
        }

        if (formValues.phoneNumber.trim() === "" && formValues.phoneNumberSecondary.trim() === "") {
            toast.error("Almeno un numero di telefono e obbligatorio");
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
                    <div className="grid">
                        <Label htmlFor="firstName" className="text-lg">
                            Nome (Nome azienda)
                        </Label>
                        <Input
                            className="text-lg!"
                            id="firstName"
                            placeholder="Mario"
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
                            placeholder="Rossi"
                            value={formValues.lastName}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, lastName: event.target.value }))}
                        />
                    </div>
                    <div className="grid">
                        <Label htmlFor="phoneNumber" className="text-lg">
                            Telefono 1
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
                    <div className="grid">
                        <Label htmlFor="phoneNumberSecondary" className="text-lg">
                            Telefono 2 (opzionale)
                        </Label>
                        <Input
                            className="text-lg!"
                            id="phoneNumberSecondary"
                            type="tel"
                            placeholder="333 9876543"
                            value={formValues.phoneNumberSecondary}
                            onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, phoneNumberSecondary: event.target.value }))
                            }
                        />
                    </div>
                    <div className="grid">
                        <Label htmlFor="email" className="text-lg">
                            Email (opzionale)
                        </Label>
                        <Input
                            className="text-lg!"
                            id="email"
                            type="email"
                            placeholder="mario.rossi@email.com"
                            value={formValues.email}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, email: event.target.value }))}
                        />
                    </div>
                    <div className="grid">
                        <Label htmlFor="city" className="text-lg">
                            Località (opzionale)
                        </Label>
                        <Input
                            className="text-lg!"
                            id="city"
                            placeholder="Roma"
                            value={formValues.city}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, city: event.target.value }))}
                        />
                    </div>
                </div>
            }
        />
    );
};

export default CreateCustomerDialog;
