import { useState } from "react";
import { toast } from "sonner";
import CustomDialog from "@/components/dialogs/customDialog";
import CopyableValue from "@/components/dialogs/settings/copyableValue";
import FormField from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { enableTwoFactor, getApiErrorMessage, isFieldRejection, startTwoFactorSetup } from "@/lib/api";
import { fieldProps } from "@/lib/formField";
import { ShieldCheck } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";

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
    const [passwordError, setPasswordError] = useState<string>();
    const [codeError, setCodeError] = useState<string>();
    const [setup, setSetup] = useState<Setup | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setPassword("");
            setCode("");
            setSetup(null);
            setPasswordError(undefined);
            setCodeError(undefined);
        }
        onOpenChange(nextOpen);
    };

    const handlePasswordStep = async () => {
        if (!password) {
            setPasswordError("Inserisci la tua password");
            document.getElementById("twoFactorPassword")?.focus();
            return;
        }

        try {
            setIsSubmitting(true);
            const result = await startTwoFactorSetup(password);
            setSetup({ secretBase32: result.secretBase32, qrDataUrl: result.qrDataUrl });
        } catch (error) {
            const message = getApiErrorMessage(error, "Impossibile avviare la configurazione");

            if (isFieldRejection(error)) {
                setPasswordError(message);
                document.getElementById("twoFactorPassword")?.focus();
            } else {
                toast.error(message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCodeStep = async () => {
        if (!code.trim()) {
            setCodeError("Inserisci il codice generato dall'app");
            document.getElementById("twoFactorConfirmCode")?.focus();
            return;
        }

        try {
            setIsSubmitting(true);
            const { recoveryCodes } = await enableTwoFactor(code.trim());
            toast.success("Verifica in due passaggi attivata");
            handleOpenChange(false);
            onEnabled(recoveryCodes);
        } catch (error) {
            const message = getApiErrorMessage(error, "Codice non valido");
            setCode("");

            if (isFieldRejection(error)) {
                setCodeError(message);
                // Il clic su "Attiva" ha lasciato il focus sul bottone: si riprova dal campo.
                document.getElementById("twoFactorConfirmCode")?.focus();
            } else {
                toast.error(message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!setup) {
        return (
            <CustomDialog
                key="password"
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
                    <FormField id="twoFactorPassword" label="Password" required error={passwordError} className="pb-2">
                        <Input
                            {...fieldProps("twoFactorPassword", { error: passwordError, required: true })}
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value);
                                setPasswordError(undefined);
                            }}
                        />
                    </FormField>
                }
            />
        );
    }

    return (
        <CustomDialog
            // `key`: i due passi sono lo stesso componente nello stesso punto, e senza un'identità
            // diversa Radix riuserebbe il dialogo già aperto senza rifare il focus iniziale.
            key="qr"
            open={open}
            onOpenChange={handleOpenChange}
            title="Inquadra il codice QR"
            description="Aggiungi l'account nella tua app di autenticazione, poi digita qui sotto il codice a 6 cifre che ti mostra."
            confirmLabel={isSubmitting ? "Verifica in corso..." : "Attiva"}
            confirmIcon={ShieldCheck}
            confirmDisabled={isSubmitting}
            cancelDisabled={isSubmitting}
            onCancel={() => handleOpenChange(false)}
            onConfirm={() => void handleCodeStep()}
            preventOutsideClose
            contentClassName="sm:max-w-[44rem]"
            // Il primo elemento focalizzabile sarebbe il pulsante di copia del segreto, ma il campo
            // che serve subito dopo la scansione è il codice. L'`InputOTP` ha un input vero (nascosto)
            // con questo id. Non sui touch: lì il focus apre la tastiera, che copre il QR prima
            // ancora di averlo inquadrato.
            onOpenAutoFocus={(event) => {
                if (window.matchMedia?.("(pointer: coarse)").matches) {
                    return;
                }
                event.preventDefault();
                document.getElementById("twoFactorConfirmCode")?.focus();
            }}
            content={
                <div className="grid gap-6 pb-2 sm:grid-cols-[auto_1fr]">
                    <div className="grid content-start gap-3">
                        <div className="flex justify-center rounded-md border border-primary/15 bg-white p-3">
                            {/* Il QR arriva già come PNG in un data URL: il segreto non passa mai
                                per un URL, dove finirebbe nei log e nella cronologia. Lo sfondo
                                resta bianco anche in tema scuro: la fotocamera ha bisogno del contrasto. */}
                            <img
                                src={setup.qrDataUrl}
                                alt="Codice QR per l'app di autenticazione"
                                className="size-44"
                            />
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
                    </div>

                    <div className="grid content-start gap-5">
                        <ol className="grid gap-3 text-base">
                            {[
                                "Apri l'app di autenticazione e aggiungi l'account: inquadra il codice QR o inserisci il codice a mano.",
                                "Leggi il codice a 6 cifre che l'app mostra.",
                                "Scrivilo qui sotto e premi Attiva.",
                            ].map((text, index) => (
                                <li key={text} className="flex gap-3">
                                    <span
                                        aria-hidden="true"
                                        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-text"
                                    >
                                        {index + 1}
                                    </span>
                                    <span>{text}</span>
                                </li>
                            ))}
                        </ol>

                        <FormField id="twoFactorConfirmCode" label="Codice di verifica" required error={codeError}>
                            <InputOTP
                                {...fieldProps("twoFactorConfirmCode", { error: codeError, required: true })}
                                autoComplete="one-time-code"
                                maxLength={6}
                                pattern={REGEXP_ONLY_DIGITS}
                                value={code}
                                onChange={(value) => {
                                    setCode(value);
                                    setCodeError(undefined);
                                }}
                            >
                                <InputOTPGroup>
                                    {/* Le caselle sono `div` disegnati sopra l'input vero, che è
                                    invisibile: il bordo rosso va chiesto a loro. */}
                                    {[0, 1, 2, 3, 4, 5].map((index) => (
                                        <InputOTPSlot
                                            key={index}
                                            index={index}
                                            aria-invalid={codeError ? true : undefined}
                                        />
                                    ))}
                                </InputOTPGroup>
                            </InputOTP>
                        </FormField>
                    </div>
                </div>
            }
        />
    );
};

export default TwoFactorSetupDialog;
