import { useState } from "react";
import { toast } from "sonner";
import CustomDialog from "@/components/dialogs/customDialog";
import CopyableValue from "@/components/dialogs/settings/copyableValue";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enableTwoFactor, getApiErrorMessage, startTwoFactorSetup } from "@/lib/api";

/**
 * Attivazione della verifica in due passaggi, in due schermate dentro lo stesso dialogo:
 * prima la password, poi il QR da inquadrare e il codice che dimostra che l'app lo ha
 * davvero acquisito.
 *
 * Il secondo passo non è una formalità: senza, basterebbe chiudere la finestra prima di
 * configurare l'app per ritrovarsi la 2FA attiva e nessun modo di generare codici.
 */
type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Riceve i codici di recupero: è l'unica volta che il server li manda in chiaro. */
    onEnabled: (recoveryCodes: string[]) => void;
};

type Setup = { secretBase32: string; qrDataUrl: string };

const TwoFactorSetupDialog = ({ open, onOpenChange, onEnabled }: Props) => {
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [setup, setSetup] = useState<Setup | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setPassword("");
            setCode("");
            setSetup(null);
        }
        onOpenChange(nextOpen);
    };

    const handlePasswordStep = async () => {
        if (!password) {
            toast.error("Inserisci la tua password");
            return;
        }

        try {
            setIsSubmitting(true);
            const result = await startTwoFactorSetup(password);
            setSetup({ secretBase32: result.secretBase32, qrDataUrl: result.qrDataUrl });
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile avviare la configurazione"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCodeStep = async () => {
        if (!code.trim()) {
            toast.error("Inserisci il codice generato dall'app");
            return;
        }

        try {
            setIsSubmitting(true);
            const { recoveryCodes } = await enableTwoFactor(code.trim());
            toast.success("Verifica in due passaggi attivata");
            handleOpenChange(false);
            onEnabled(recoveryCodes);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Codice non valido"));
            setCode("");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!setup) {
        return (
            <CustomDialog
                open={open}
                onOpenChange={handleOpenChange}
                title="Attiva la verifica in due passaggi"
                description="Conferma la tua password per iniziare. Ti serviranno un'app di autenticazione sul telefono (Google Authenticator, Aegis, 1Password) e un minuto di tempo."
                confirmLabel={isSubmitting ? "Attendere..." : "Continua"}
                confirmDisabled={isSubmitting}
                cancelDisabled={isSubmitting}
                onCancel={() => handleOpenChange(false)}
                onConfirm={() => void handlePasswordStep()}
                preventOutsideClose
                content={
                    <div className="grid gap-2 py-2">
                        <Label htmlFor="twoFactorPassword">Password</Label>
                        <Input
                            id="twoFactorPassword"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    </div>
                }
            />
        );
    }

    return (
        <CustomDialog
            open={open}
            onOpenChange={handleOpenChange}
            title="Inquadra il codice QR"
            description="Aggiungi l'account nella tua app di autenticazione, poi digita qui sotto il codice a 6 cifre che ti mostra."
            confirmLabel={isSubmitting ? "Verifica in corso..." : "Attiva"}
            confirmDisabled={isSubmitting}
            cancelDisabled={isSubmitting}
            onCancel={() => handleOpenChange(false)}
            onConfirm={() => void handleCodeStep()}
            preventOutsideClose
            content={
                <div className="grid gap-3 py-2">
                    <div className="flex justify-center rounded-md border border-primary/15 bg-white p-3">
                        {/* Il QR arriva già come PNG in un data URL: il segreto non passa mai
                            per un URL, dove finirebbe nei log e nella cronologia. */}
                        <img src={setup.qrDataUrl} alt="Codice QR per l'app di autenticazione" className="size-44" />
                    </div>

                    {/* Non tutti possono inquadrare: chi usa l'app sullo stesso dispositivo,
                        o una che non apre la fotocamera, inserisce il segreto a mano. */}
                    <CopyableValue
                        id="twoFactorSecret"
                        label="Oppure inserisci questo codice a mano"
                        value={setup.secretBase32}
                        copiedMessage="Codice copiato negli appunti"
                        errorMessage="Impossibile copiare il codice"
                    />

                    <div className="grid gap-2">
                        <Label htmlFor="twoFactorConfirmCode">Codice di verifica</Label>
                        <Input
                            id="twoFactorConfirmCode"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            maxLength={6}
                            className="text-center font-mono text-lg tracking-widest"
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                        />
                    </div>
                </div>
            }
        />
    );
};

export default TwoFactorSetupDialog;
