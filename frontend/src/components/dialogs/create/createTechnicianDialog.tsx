import CustomDialog from "@/components/dialogs/customDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api";
import type { TechnicianDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

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

const CreateTechnicianDialog = ({ open, onOpenChange, onSubmit, mode = "create", initialValues = null }: Props) => {
    const [formValues, setFormValues] = useState({
        firstName: "",
        lastName: "",
        phoneNumber: "",
        vatNumber: "",
    });
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
            });
        }
    }, [open, initialValues]);

    const handleConfirm = async () => {
        if (formValues.firstName === "") {
            toast.error("Il nome non può essere vuoto");
            return;
        }

        if (formValues.lastName === "") {
            toast.error("Il cognome non può essere vuoto");
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
                            placeholder="Anna"
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
                            placeholder="Verdi"
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
                    <div className="grid">
                        <Label htmlFor="vatNumber" className="text-lg">
                            Partita IVA
                        </Label>
                        <Input
                            className="text-lg!"
                            id="vatNumber"
                            placeholder="IT12345678901"
                            value={formValues.vatNumber}
                            onChange={(event) => setFormValues((prev) => ({ ...prev, vatNumber: event.target.value }))}
                        />
                    </div>
                </div>
            }
        />
    );
};

export default CreateTechnicianDialog;
