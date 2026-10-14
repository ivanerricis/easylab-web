import { useState } from "react";
import { toast } from "sonner";
import { Check, Circle, Eye, EyeOff, Save, X } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import FormSection, { tintedSectionClassName } from "@/components/dialogs/form-section";
import FormField from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeOwnPassword, getApiErrorMessage, getApiErrorStatus } from "@/lib/api";
import { fieldProps, hasFormChanged, reportFieldErrors } from "@/lib/formField";
import { isPasswordCompliant, passwordRequirements } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

type FieldErrors = Partial<Record<keyof typeof emptyForm, string>>;

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
const fieldOrder = ["currentPassword", "newPassword", "confirmPassword"] as const;

const hiddenPasswords = { currentPassword: false, newPassword: false, confirmPassword: false };

/**
 * Il campo password con l'occhio mostra/nascondi. Locale a questo dialogo: lo stesso markup è
 * anche in accesso, cambio password forzato ed email, ma unificarli è un altro lavoro.
 * `toggleSubject` distingue le `aria-label` dei tre occhi ("Mostra nuova password"…).
 */
const PasswordInput = ({
    id,
    error,
    autoComplete,
    value,
    onChange,
    isVisible,
    onToggleVisible,
    toggleSubject,
}: {
    id: string;
    error?: string;
    autoComplete: string;
    value: string;
    onChange: (value: string) => void;
    isVisible: boolean;
    onToggleVisible: () => void;
    toggleSubject: string;
}) => (
    <div className="relative">
        <Input
            {...fieldProps(id, { error, required: true })}
            type={isVisible ? "text" : "password"}
            autoComplete={autoComplete}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="pr-9"
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center">
            <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onToggleVisible}
                aria-label={`${isVisible ? "Nascondi" : "Mostra"} ${toggleSubject}`}
            >
                {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
        </div>
    </div>
);

const ChangePasswordDialog = ({ open, onOpenChange }: Props) => {
    const [formValues, setFormValues] = useState(emptyForm);
    const [errors, setErrors] = useState<FieldErrors>({});
    // I requisiti restano grigi finché non si scrive nel campo: aprendo il dialogo li si vedeva
    // tutti rossi, come se si fosse già sbagliato qualcosa senza aver toccato niente.
    const [hasTypedNewPassword, setHasTypedNewPassword] = useState(false);
    // Uno stato per campo: con uno solo l'occhio della nuova password cambiava anche la conferma
    // senza dirlo.
    const [visibility, setVisibility] = useState(hiddenPasswords);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isDirty = hasFormChanged(formValues, emptyForm);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setFormValues(emptyForm);
            setErrors({});
            setHasTypedNewPassword(false);
            setVisibility(hiddenPasswords);
        }
        onOpenChange(nextOpen);
    };

    const toggleVisibility = (field: keyof typeof emptyForm) =>
        setVisibility((prev) => ({ ...prev, [field]: !prev[field] }));

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
            nextErrors.newPassword = "La password non rispetta tutti i requisiti";
        }

        if (!formValues.confirmPassword) {
            nextErrors.confirmPassword = "Ripeti la nuova password";
        } else if (formValues.confirmPassword !== formValues.newPassword) {
            nextErrors.confirmPassword = "Le due password inserite non coincidono";
        }

        if (reportFieldErrors(nextErrors, fieldOrder, setErrors)) {
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
                reportFieldErrors({ currentPassword: message }, fieldOrder, setErrors);
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
                        <PasswordInput
                            id="currentPassword"
                            error={errors.currentPassword}
                            autoComplete="current-password"
                            value={formValues.currentPassword}
                            onChange={(value) => updateField("currentPassword", value)}
                            isVisible={visibility.currentPassword}
                            onToggleVisible={() => toggleVisibility("currentPassword")}
                            toggleSubject="password attuale"
                        />
                    </FormField>

                    <FormSection title="Scegli la nuova password" className={tintedSectionClassName}>
                        <FormField id="newPassword" label="Nuova password" required error={errors.newPassword}>
                            <PasswordInput
                                id="newPassword"
                                error={errors.newPassword}
                                autoComplete="new-password"
                                value={formValues.newPassword}
                                onChange={(value) => {
                                    updateField("newPassword", value);
                                    setHasTypedNewPassword(true);
                                }}
                                isVisible={visibility.newPassword}
                                onToggleVisible={() => toggleVisibility("newPassword")}
                                toggleSubject="nuova password"
                            />
                            <ul className="mt-2 flex flex-wrap gap-2">
                                {passwordRequirements.map((requirement) => {
                                    const satisfied = requirement.isSatisfied(formValues.newPassword);
                                    const state = !showRequirementStatus ? "idle" : satisfied ? "met" : "unmet";
                                    const StatusIcon = state === "idle" ? Circle : state === "met" ? Check : X;
                                    return (
                                        <li
                                            key={requirement.label}
                                            data-state={state}
                                            className={cn(
                                                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm",
                                                state === "idle" && "bg-muted text-muted-foreground",
                                                state === "met" && "bg-status-green/10 text-status-green-foreground",
                                                state === "unmet" && "bg-status-red/10 text-status-red-foreground"
                                            )}
                                        >
                                            <StatusIcon aria-hidden="true" className="size-3.5 shrink-0" />
                                            {requirement.label}
                                            {/* Il colore non può essere l'unico segnale. */}
                                            <span className="sr-only">
                                                {state === "idle"
                                                    ? "non ancora verificato"
                                                    : state === "met"
                                                      ? "soddisfatto"
                                                      : "non soddisfatto"}
                                            </span>
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
                            <PasswordInput
                                id="confirmPassword"
                                error={errors.confirmPassword}
                                autoComplete="new-password"
                                value={formValues.confirmPassword}
                                onChange={(value) => updateField("confirmPassword", value)}
                                isVisible={visibility.confirmPassword}
                                onToggleVisible={() => toggleVisibility("confirmPassword")}
                                toggleSubject="conferma password"
                            />
                        </FormField>
                    </FormSection>
                </div>
            }
        />
    );
};

export default ChangePasswordDialog;
