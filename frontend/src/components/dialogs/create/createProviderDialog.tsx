import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { fieldProps, hasFormChanged, reportFieldErrors } from "@/lib/formField";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import { isValidEmail } from "@/lib/utils";
import type { ProviderDto } from "@/types/dtos";
import { startTransition, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

/** I valori che questo dialogo consegna a chi lo apre. */
export type ProviderSubmitValues = {
    providerName: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: ProviderSubmitValues) => Promise<void> | void;
    mode?: "create" | "edit";
    initialValues?: ProviderDto | null;
};

type FieldErrors = Partial<Record<"providerName" | "email" | "phoneNumber", string>>;

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
const fieldOrder = ["providerName", "email", "phoneNumber"] as const;

/**
 * Il fornitore è l'azienda con cui il laboratorio stipula i contratti per conto dei clienti: il
 * nome, l'email e il telefono sono i dati che servono (l'email è anche dove arrivano gli avvisi di
 * consumo delle ore), il referente è facoltativo.
 */
const CreateProviderDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [formValues, setFormValues] = useState<ProviderSubmitValues>({
        providerName: "",
        firstName: "",
        lastName: "",
        email: "",
        phoneNumber: "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const initialFormValues = useMemo<ProviderSubmitValues>(
        () => ({
            providerName: initialValues?.providerName ?? "",
            firstName: initialValues?.firstName ?? "",
            lastName: initialValues?.lastName ?? "",
            email: initialValues?.email ?? "",
            phoneNumber: initialValues?.phoneNumber ?? "",
        }),
        [initialValues]
    );
    const isDirty = hasFormChanged(formValues, initialFormValues);

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setFormValues(initialFormValues);
                setErrors({});
            });
        }
    }, [open, initialFormValues]);

    const setField = (field: keyof ProviderSubmitValues, value: string) => {
        setFormValues((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const handleConfirm = async () => {
        // Tutti gli errori insieme, come negli altri dialoghi: vedi `CreateTechnicianDialog`.
        const nextErrors: FieldErrors = {};
        const email = formValues.email.trim();

        if (formValues.providerName.trim() === "") {
            nextErrors.providerName = "Il nome del fornitore non può essere vuoto";
        }

        if (email === "") {
            nextErrors.email = "L'email non può essere vuota";
        } else if (!isValidEmail(email)) {
            nextErrors.email = "Indirizzo email non valido";
        }

        if (formValues.phoneNumber.trim() === "") {
            nextErrors.phoneNumber = "Il telefono non può essere vuoto";
        }

        if (reportFieldErrors(nextErrors, fieldOrder, setErrors)) {
            return;
        }

        if (isSubmitting) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit(formValues);
            onOpenChange(false);
            toast.success(mode === "edit" ? "Fornitore aggiornato con successo" : "Fornitore creato con successo");
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
            isDirty={isDirty}
            title={mode === "edit" ? "Modifica fornitore" : "Nuovo fornitore"}
            description={
                mode === "edit"
                    ? "Aggiorna i dati del fornitore e conferma per salvare."
                    : "Inserisci i dati del fornitore e conferma per salvare."
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
                    <FormField id="providerName" label="Nome fornitore" required error={errors.providerName}>
                        <Input
                            {...fieldProps("providerName", { error: errors.providerName, required: true })}
                            autoComplete="off"
                            placeholder="Es. Rossi Informatica S.r.l."
                            value={formValues.providerName}
                            onChange={(event) => setField("providerName", event.target.value)}
                        />
                    </FormField>
                    <div className="grid gap-6 sm:grid-cols-2">
                        <FormField id="firstName" label="Nome referente">
                            <Input
                                {...fieldProps("firstName")}
                                autoComplete="off"
                                placeholder="Es. Anna"
                                value={formValues.firstName}
                                onChange={(event) => setField("firstName", event.target.value)}
                            />
                        </FormField>
                        <FormField id="lastName" label="Cognome referente">
                            <Input
                                {...fieldProps("lastName")}
                                autoComplete="off"
                                placeholder="Es. Verdi"
                                value={formValues.lastName}
                                onChange={(event) => setField("lastName", event.target.value)}
                            />
                        </FormField>
                    </div>
                    <FormField id="email" label="Email" required error={errors.email}>
                        <Input
                            {...fieldProps("email", { error: errors.email, required: true })}
                            type="email"
                            autoComplete="off"
                            placeholder="Es. assistenza@fornitore.it"
                            value={formValues.email}
                            onChange={(event) => setField("email", event.target.value)}
                        />
                    </FormField>
                    <FormField id="phoneNumber" label="Telefono" required error={errors.phoneNumber}>
                        <Input
                            {...fieldProps("phoneNumber", { error: errors.phoneNumber, required: true })}
                            type="tel"
                            autoComplete="off"
                            placeholder="Es. 081 1234567"
                            value={formValues.phoneNumber}
                            onChange={(event) => setField("phoneNumber", event.target.value)}
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default CreateProviderDialog;
