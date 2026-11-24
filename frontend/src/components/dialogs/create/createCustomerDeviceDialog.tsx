import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { customerDeviceTypeOptions } from "@/lib/customerDevices";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import type { CustomerDeviceDto, CustomerDeviceType } from "@/types/dtos";
import { Save } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

/** I valori che questo dialogo consegna a chi lo apre: il cliente lo sa chi apre il dialogo. */
export type CustomerDeviceSubmitValues = {
    type: CustomerDeviceType;
    name: string;
    serialNumber: string;
    model: string | null;
    note: string | null;
};

type FormState = {
    type: CustomerDeviceType | "";
    name: string;
    serialNumber: string;
    model: string;
    note: string;
};

type FieldErrors = Partial<Record<"type" | "name" | "serialNumber", string>>;

const emptyForm: FormState = { type: "", name: "", serialNumber: "", model: "", note: "" };

const toFormState = (device: CustomerDeviceDto | null): FormState =>
    device
        ? {
              type: device.type,
              name: device.name,
              serialNumber: device.serialNumber,
              model: device.model ?? "",
              note: device.note ?? "",
          }
        : emptyForm;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Può restituire il dispositivo salvato, per chi lo vuole subito (il dialogo del contratto lo seleziona). */
    onSubmit: (values: CustomerDeviceSubmitValues) => Promise<unknown> | void;
    mode?: "create" | "edit";
    initialValues?: CustomerDeviceDto | null;
    /** Il nome del cliente a cui appartiene il dispositivo, mostrato in descrizione: non si sceglie qui. */
    customerName?: string;
};

/**
 * Crea o modifica un dispositivo del cliente. Il cliente non è un campo: si apre dalla sua
 * scheda o dal modulo del contratto, che lo conoscono già.
 */
const CreateCustomerDeviceDialog = ({
    open,
    onOpenChange,
    onSubmit,
    mode = "create",
    initialValues = null,
    customerName,
}: Props) => {
    const [form, setForm] = useState<FormState>(toFormState(initialValues));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const initialForm = toFormState(initialValues);
    const isDirty = (Object.keys(form) as (keyof FormState)[]).some((key) => form[key] !== initialForm[key]);

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setForm(toFormState(initialValues));
                setErrors({});
            });
        }
    }, [open, initialValues]);

    const update = (patch: Partial<FormState>) => {
        setForm((previous) => ({ ...previous, ...patch }));
        setErrors((previous) => {
            const next = { ...previous };
            for (const key of Object.keys(patch) as (keyof FormState)[]) {
                delete next[key as keyof FieldErrors];
            }
            return next;
        });
    };

    const handleConfirm = async () => {
        const nextErrors: FieldErrors = {};

        if (form.name.trim() === "") {
            nextErrors.name = "Il nome del dispositivo non può essere vuoto";
        }

        if (form.type === "") {
            nextErrors.type = "Seleziona il tipo di dispositivo";
        }

        if (form.serialNumber.trim() === "") {
            nextErrors.serialNumber = "Il numero di serie è obbligatorio";
        }

        setErrors(nextErrors);

        const firstInvalid = (["name", "type", "serialNumber"] as const).find((key) => nextErrors[key]);

        if (firstInvalid || form.type === "") {
            if (firstInvalid) {
                document.getElementById(`device-${firstInvalid}`)?.focus();
            }
            return;
        }

        if (isSubmitting) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({
                type: form.type,
                name: form.name.trim(),
                serialNumber: form.serialNumber.trim(),
                model: form.model.trim() || null,
                note: form.note.trim() || null,
            });
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
            isDirty={isDirty}
            title={mode === "edit" ? "Modifica dispositivo" : "Nuovo dispositivo"}
            description={
                customerName
                    ? `Dispositivo di ${customerName}. Compila i dati e conferma per salvare.`
                    : "Compila i dati del dispositivo e conferma per salvare."
            }
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            confirmIcon={Save}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <div className="grid gap-4">
                    <FormField id="device-name" label="Nome" required error={errors.name}>
                        <Input
                            {...fieldProps("device-name", { error: errors.name, required: true })}
                            placeholder="Es. Server ufficio"
                            maxLength={255}
                            value={form.name}
                            onChange={(event) => update({ name: event.target.value })}
                        />
                    </FormField>

                    <FormField id="device-type" label="Tipo" required error={errors.type}>
                        <Select
                            value={form.type}
                            onValueChange={(value) => update({ type: value as CustomerDeviceType })}
                        >
                            <SelectTrigger
                                id="device-type"
                                {...fieldErrorAria("device-type", errors.type)}
                                className="w-full"
                            >
                                <SelectValue placeholder="Seleziona il tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                {customerDeviceTypeOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>

                    <FormField id="device-serialNumber" label="Numero di serie" required error={errors.serialNumber}>
                        <Input
                            {...fieldProps("device-serialNumber", { error: errors.serialNumber, required: true })}
                            maxLength={255}
                            value={form.serialNumber}
                            onChange={(event) => update({ serialNumber: event.target.value })}
                        />
                    </FormField>

                    <FormField id="device-model" label="Marca e modello">
                        <Input
                            {...fieldProps("device-model")}
                            maxLength={255}
                            value={form.model}
                            onChange={(event) => update({ model: event.target.value })}
                        />
                    </FormField>

                    <FormField id="device-note" label="Note">
                        <Textarea
                            {...fieldProps("device-note")}
                            maxLength={4000}
                            value={form.note}
                            onChange={(event) => update({ note: event.target.value })}
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default CreateCustomerDeviceDialog;
