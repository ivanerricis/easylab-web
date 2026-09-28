import { useState } from "react";
import { toast } from "sonner";
import { Check, Circle, Eye, EyeOff, Save, X } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeOwnPassword, getApiErrorMessage, getApiErrorStatus } from "@/lib/api";
import { fieldProps, hasFormChanged } from "@/lib/formField";
import { isPasswordCompliant, passwordRequirements } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

type FieldErrors = Partial<Record<keyof typeof emptyForm, string>>;

const ChangePasswordDialog = ({ open, onOpenChange }: Props) => {
    const [formValues, setFormValues] = useState(emptyForm);
    const [errors, setErrors] = useState<FieldErrors>({});
    // I requisiti restano grigi finché non si scrive nel campo: aprendo il dialogo li si vedeva
    // tutti rossi, come se si fosse già sbagliato qualcosa senza aver toccato niente.
    const [hasTypedNewPassword, setHasTypedNewPassword] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isDirty = hasFormChanged(formValues, emptyForm);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setFormValues(emptyForm);
            setErrors({});
            setHasTypedNewPassword(false);
            setIsPasswordVisible(false);
        }
        onOpenChange(nextOpen);
    };

    const updateField = (field: keyof typeof emptyForm, value: string) => {
        setFormValues((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const handleConfirm = async () => {
        if (isSubmitting) {
            return;
        }

        const nextErrors: FieldErrors = {};

        if (!formValues.currentPassword) {
            nextErrors.currentPassword = "Inserisci la password attuale";
        }

        if (!isPasswordCompliant(formValues.newPassword)) {
            nextErrors.newPassword = "La password non rispetta tutti i requisiti qui sopra";
        }

        if (!formValues.confirmPassword) {
            nextErrors.confirmPassword = "Ripeti la nuova password";
        } else if (formValues.confirmPassword !== formValues.newPassword) {
            nextErrors.confirmPassword = "Le due password inserite non coincidono";
        }

        setErrors(nextErrors);

        const firstInvalidField = (["currentPassword", "newPassword", "confirmPassword"] as const).find(
            (field) => nextErrors[field]
        );

        if (firstInvalidField) {
            document.getElementById(firstInvalidField)?.focus();
            return;
        }

        try {
            setIsSubmitting(true);
            await changeOwnPassword({
                currentPassword: formValues.currentPassword,
                newPassword: formValues.newPassword,
            });
            toast.success("Password aggiornata con successo");
            handleOpenChange(false);
        } catch (error) {
            const message = getApiErrorMessage(error, "Impossibile aggiornare la password");
            const status = getApiErrorStatus(error);

            // 400 è la password attuale sbagliata, 429 i troppi tentativi con quella password:
            // riguardano quel campo, e il messaggio va lì come nella pagina di accesso. Il resto
            // (rete, sessione scaduta, errore del server) non è colpa di un campo e resta un toast.
            if (status === 400 || status === 429) {
                setErrors({ currentPassword: message });
                document.getElementById("currentPassword")?.focus();
            } else {
                toast.error(message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Dopo un "Salva" a vuoto i requisiti si colorano comunque: l'errore rimanda a loro.
    const showRequirementStatus = hasTypedNewPassword || Boolean(errors.newPassword);

    return (
        <CustomDialog
            open={open}
            onOpenChange={handleOpenChange}
            isDirty={isDirty}
            title="Cambia password"
            description="Inserisci la password attuale e quella nuova."
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            confirmIcon={Save}
            cancelLabel="Annulla"
            onCancel={() => handleOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <div className="grid gap-4">
                    <FormField id="currentPassword" label="Password attuale" required error={errors.currentPassword}>
                        <Input
                            {...fieldProps("currentPassword", { error: errors.currentPassword, required: true })}
                            type="password"
                            autoComplete="current-password"
                            value={formValues.currentPassword}
                            onChange={(event) => updateField("currentPassword", event.target.value)}
                        />
                    </FormField>

                    <FormField id="newPassword" label="Nuova password" required error={errors.newPassword}>
                        <div className="relative">
                            <Input
                                {...fieldProps("newPassword", { error: errors.newPassword, required: true })}
                                type={isPasswordVisible ? "text" : "password"}
                                autoComplete="new-password"
                                value={formValues.newPassword}
                                onChange={(event) => {
                                    updateField("newPassword", event.target.value);
                                    setHasTypedNewPassword(true);
                                }}
                                className="pr-9"
                            />
                            <div className="absolute inset-y-0 right-1.5 flex items-center">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                                    aria-label={isPasswordVisible ? "Nascondi password" : "Mostra password"}
                                >
                                    {isPasswordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </Button>
                            </div>
                        </div>
                        <ul className="mt-2 grid gap-1">
                            {passwordRequirements.map((requirement) => {
                                const satisfied = requirement.isSatisfied(formValues.newPassword);
                                const StatusIcon = !showRequirementStatus ? Circle : satisfied ? Check : X;
                                return (
                                    <li
                                        key={requirement.label}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs",
                                            !showRequirementStatus
                                                ? "text-muted-foreground"
                                                : satisfied
                                                  ? "text-status-green-foreground line-through"
                                                  : "text-status-red-foreground"
                                        )}
                                    >
                                        <StatusIcon className="size-3.5 shrink-0" />
                                        {requirement.label}
                                    </li>
                                );
                            })}
                        </ul>
                    </FormField>

                    <FormField
                        id="confirmPassword"
                        label="Conferma nuova password"
                        required
                        error={errors.confirmPassword}
                    >
                        <Input
                            {...fieldProps("confirmPassword", { error: errors.confirmPassword, required: true })}
                            type={isPasswordVisible ? "text" : "password"}
                            autoComplete="new-password"
                            value={formValues.confirmPassword}
                            onChange={(event) => updateField("confirmPassword", event.target.value)}
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default ChangePasswordDialog;
