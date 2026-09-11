import { useState } from "react";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Save, X } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import { RequiredMark } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword, getApiErrorMessage } from "@/lib/api";
import { isPasswordCompliant, passwordRequirements, passwordRequirementsHint } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

const ChangePasswordDialog = ({ open, onOpenChange }: Props) => {
    const [formValues, setFormValues] = useState(emptyForm);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setFormValues(emptyForm);
            setIsPasswordVisible(false);
        }
        onOpenChange(nextOpen);
    };

    const handleConfirm = async () => {
        if (isSubmitting) {
            return;
        }

        if (!formValues.currentPassword) {
            toast.error("Inserisci la password attuale");
            return;
        }

        if (!isPasswordCompliant(formValues.newPassword)) {
            toast.error(passwordRequirementsHint);
            return;
        }

        if (formValues.newPassword !== formValues.confirmPassword) {
            toast.error("Le due password inserite non coincidono");
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
            toast.error(getApiErrorMessage(error, "Impossibile aggiornare la password"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={handleOpenChange}
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
                    <div className="grid gap-2">
                        <Label htmlFor="currentPassword">
                            Password attuale
                            <RequiredMark />
                        </Label>
                        <Input
                            id="currentPassword"
                            type="password"
                            autoComplete="current-password"
                            value={formValues.currentPassword}
                            onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, currentPassword: event.target.value }))
                            }
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="newPassword">
                            Nuova password
                            <RequiredMark />
                        </Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={isPasswordVisible ? "text" : "password"}
                                autoComplete="new-password"
                                value={formValues.newPassword}
                                onChange={(event) =>
                                    setFormValues((prev) => ({ ...prev, newPassword: event.target.value }))
                                }
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
                        <ul className="grid gap-1">
                            {passwordRequirements.map((requirement) => {
                                const satisfied = requirement.isSatisfied(formValues.newPassword);
                                return (
                                    <li
                                        key={requirement.label}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs",
                                            satisfied ? "text-green-600 line-through" : "text-red-600"
                                        )}
                                    >
                                        {satisfied ? (
                                            <Check className="size-3.5 shrink-0" />
                                        ) : (
                                            <X className="size-3.5 shrink-0" />
                                        )}
                                        {requirement.label}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="confirmPassword">
                            Conferma nuova password
                            <RequiredMark />
                        </Label>
                        <Input
                            id="confirmPassword"
                            type={isPasswordVisible ? "text" : "password"}
                            autoComplete="new-password"
                            value={formValues.confirmPassword}
                            onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, confirmPassword: event.target.value }))
                            }
                        />
                    </div>
                </div>
            }
        />
    );
};

export default ChangePasswordDialog;
