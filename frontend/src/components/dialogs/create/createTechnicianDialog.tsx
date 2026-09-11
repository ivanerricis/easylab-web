import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { fieldProps } from "@/lib/formField";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import type { TechnicianDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

/** I valori che questo dialogo consegna a chi lo apre. */
export type TechnicianSubmitValues = {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    vatNumber: string;
};

type TechnicianDialogMode = "create" | "edit";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: TechnicianSubmitValues) => Promise<void> | void;
    mode?: TechnicianDialogMode;
    initialValues?: TechnicianDto | null;
};

type FieldErrors = Partial<Record<"firstName" | "lastName", string>>;

const CreateTechnicianDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [formValues, setFormValues] = useState({
        firstName: "",
        lastName: "",
        phoneNumber: "",
        vatNumber: "",
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
                    vatNumber: initialValues?.vatNumber ?? "",
                });
                setErrors({});
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        // Tutti gli errori insieme, non uno alla volta: prima il primo campo vuoto faceva
        // uscire dalla funzione, quindi con nome e cognome vuoti bisognava salvare due volte
        // per scoprire il secondo problema.
        const nextErrors: FieldErrors = {};

        if (formValues.firstName.trim() === "") {
            nextErrors.firstName = "Il nome non può essere vuoto";
        }

        if (formValues.lastName.trim() === "") {
            nextErrors.lastName = "Il cognome non può essere vuoto";
        }

        setErrors(nextErrors);

        const firstInvalidField = (["firstName", "lastName"] as const).find((field) => nextErrors[field]);

        if (firstInvalidField) {
            // Il focus va sul primo campo da correggere: senza questo, su un form da quattro
            // campi bisogna cercare a occhio quale sia quello segnalato.
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
            toast.success(mode === "edit" ? "Tecnico aggiornato con successo" : "Tecnico creato con successo");
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
            title={mode === "edit" ? "Modifica tecnico" : "Nuovo tecnico"}
            description={
                mode === "edit"
                    ? "Aggiorna i dati del tecnico e conferma per salvare."
                    : "Inserisci i dati del tecnico e conferma per salvare."
            }
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            confirmIcon={Save}
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
                            // tecnico che si sta inserendo.
                            autoComplete="off"
                            placeholder="Anna"
                            value={formValues.firstName}
                            onChange={(event) => {
                                setFormValues((prev) => ({ ...prev, firstName: event.target.value }));
                                setErrors((prev) => ({ ...prev, firstName: undefined }));
                            }}
                        />
                    </FormField>
                    <FormField id="lastName" label="Cognome" required error={errors.lastName}>
                        <Input
                            {...fieldProps("lastName", { error: errors.lastName, required: true })}
                            className="text-lg!"
                            autoComplete="off"
                            placeholder="Verdi"
                            value={formValues.lastName}
                            onChange={(event) => {
                                setFormValues((prev) => ({ ...prev, lastName: event.target.value }));
                                setErrors((prev) => ({ ...prev, lastName: undefined }));
                            }}
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
                    <FormField id="vatNumber" label="Partita IVA">
                        <Input
                            {...fieldProps("vatNumber")}
                            className="text-lg!"
                            autoComplete="off"
                            placeholder="IT12345678901"
                            value={formValues.vatNumber}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, vatNumber: event.target.value }))}
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default CreateTechnicianDialog;
