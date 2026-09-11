import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import CustomDialog from "@/components/dialogs/customDialog";
import { RequiredMark } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setPassword("");
            setCode("");
        }
        onOpenChange(nextOpen);
    };

    const handleConfirm = async () => {
        if (!password || !code.trim()) {
            toast.error("Inserisci password e codice");
            return;
        }

        try {
            setIsSubmitting(true);
            await onConfirm(password, code.trim());
            handleOpenChange(false);
        } catch {
            // Il messaggio d'errore lo mostra chi ha passato `onConfirm`, che sa cosa stava
            // facendo, e poi rilancia apposta perché il dialogo resti aperto. Qui l'errore va
            // solo fermato: senza questo `catch` arrivava fino al `void handleConfirm()` del
            // pulsante e diventava un "Uncaught (in promise)" nella console a ogni codice
            // sbagliato.
        } finally {
            // Resta da riabilitare i campi perché si possa riprovare.
            setIsSubmitting(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={handleOpenChange}
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
                <div className="grid gap-3 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="twoFactorConfirmPassword">
                            Password
                            <RequiredMark />
                        </Label>
                        <Input
                            id="twoFactorConfirmPassword"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="twoFactorConfirmCode">
                            Codice di verifica o di recupero
                            <RequiredMark />
                        </Label>
                        <Input
                            id="twoFactorConfirmCode"
                            autoComplete="one-time-code"
                            maxLength={9}
                            className="text-center font-mono tracking-widest"
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                        />
                    </div>
                </div>
            }
        />
    );
};

export default TwoFactorConfirmDialog;
