import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { fieldProps } from "@/lib/formField";
import { getApiErrorMessage, isFieldRejection } from "@/lib/api";

/**
 * Password *e* secondo fattore insieme, come chiede il backend.
 *
 * Disattivare la verifica e rigenerare i codici di recupero sono richieste diverse ma con la
 * stessa domanda davanti — chiederne uno solo renderebbe l'intera 2FA aggirabile da chi ha
 * ottenuto quell'uno — quindi il dialogo è uno e cambia solo nei testi.
 */
type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel: string;
    submittingLabel: string;
    /** Diversa per le due richieste: disattivare e rigenerare non sono la stessa azione. */
    confirmIcon?: LucideIcon;
    destructive?: boolean;
    onConfirm: (password: string, code: string) => Promise<void>;
};

const TwoFactorConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    submittingLabel,
    confirmIcon,
    destructive = false,
    onConfirm,
}: Props) => {
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [passwordError, setPasswordError] = useState<string>();
    const [codeError, setCodeError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setPassword("");
            setCode("");
            setPasswordError(undefined);
            setCodeError(undefined);
        }
        onOpenChange(nextOpen);
    };

    const handleConfirm = async () => {
        const nextPasswordError = password ? undefined : "Inserisci la password";
        const nextCodeError = code.trim() ? undefined : "Inserisci un codice dell'app o di recupero";
        setPasswordError(nextPasswordError);
        setCodeError(nextCodeError);

        if (nextPasswordError || nextCodeError) {
            document.getElementById(nextPasswordError ? "twoFactorConfirmPassword" : "twoFactorConfirmCode")?.focus();
            return;
        }

        try {
            setIsSubmitting(true);
            await onConfirm(password, code.trim());
            handleOpenChange(false);
        } catch (error) {
            // Chi ha passato `onConfirm` rilancia apposta perché il dialogo resti aperto, e
            // mostra lui in un toast gli errori che non sono di un campo (rete, server). Password
            // o codice sbagliati (400, 429 per i troppi tentativi) vanno invece qui, sotto il
            // campo, come nella pagina di accesso. Quale dei due lo dice il messaggio: il server
            // controlla prima la password e poi il codice, e i due messaggi nominano il proprio
            // campo. Se un giorno cambiassero, il testo resterebbe giusto, solo sotto l'altro
            // campo. Senza questo `catch` l'errore arrivava al `void handleConfirm()` del
            // pulsante e diventava un "Uncaught (in promise)" nella console.
            if (isFieldRejection(error)) {
                const message = getApiErrorMessage(error, "Verifica non riuscita");

                if (/password/i.test(message)) {
                    setPasswordError(message);
                    document.getElementById("twoFactorConfirmPassword")?.focus();
                } else {
                    setCode("");
                    setCodeError(message);
                    document.getElementById("twoFactorConfirmCode")?.focus();
                }
            }
        } finally {
            // Resta da riabilitare i campi perché si possa riprovare.
            setIsSubmitting(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={handleOpenChange}
            isDirty={password !== "" || code !== ""}
            title={title}
            description={description}
            destructive={destructive}
            confirmLabel={isSubmitting ? submittingLabel : confirmLabel}
            confirmIcon={confirmIcon}
            confirmDisabled={isSubmitting}
            cancelDisabled={isSubmitting}
            onCancel={() => handleOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            content={
                <div className="grid gap-3 pb-2">
                    <FormField id="twoFactorConfirmPassword" label="Password" required error={passwordError}>
                        <Input
                            {...fieldProps("twoFactorConfirmPassword", { error: passwordError, required: true })}
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value);
                                setPasswordError(undefined);
                            }}
                        />
                    </FormField>

                    <FormField
                        id="twoFactorConfirmCode"
                        label="Codice di verifica o di recupero"
                        required
                        error={codeError}
                    >
                        <Input
                            {...fieldProps("twoFactorConfirmCode", { error: codeError, required: true })}
                            autoComplete="one-time-code"
                            maxLength={9}
                            className="text-center font-mono tracking-widest"
                            value={code}
                            onChange={(event) => {
                                setCode(event.target.value);
                                setCodeError(undefined);
                            }}
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default TwoFactorConfirmDialog;
