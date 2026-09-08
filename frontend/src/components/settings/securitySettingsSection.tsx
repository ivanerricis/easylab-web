import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsLoadingBox, SettingsSection } from "@/components/settings/settingsUi";
import RecoveryCodesDialog from "@/components/dialogs/settings/recoveryCodesDialog";
import TwoFactorConfirmDialog from "@/components/dialogs/settings/twoFactorConfirmDialog";
import TwoFactorSetupDialog from "@/components/dialogs/settings/twoFactorSetupDialog";
import {
    disableTwoFactor,
    getApiErrorMessage,
    getTwoFactorStatus,
    regenerateRecoveryCodes,
    type TwoFactorStatusDto,
} from "@/lib/api";
import { useAuth } from "@/components/use-auth";
import { cn } from "@/lib/utils";

/**
 * La sezione "Sicurezza" delle impostazioni: riguarda il proprio account, non il laboratorio,
 * ed è quindi — insieme al tema — una delle poche visibili anche a chi non è amministratore.
 */
const SecuritySettingsSection = () => {
    const { refresh } = useAuth();
    const [status, setStatus] = useState<TwoFactorStatusDto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSetupOpen, setIsSetupOpen] = useState(false);
    const [isDisableOpen, setIsDisableOpen] = useState(false);
    const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

    const loadStatus = async () => {
        setIsLoading(true);

        try {
            setStatus(await getTwoFactorStatus());
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile leggere lo stato della verifica"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        startTransition(() => {
            void loadStatus();
        });
    }, []);

    /**
     * `refresh` oltre a `loadStatus`: `twoFactorEnabled` sta anche dentro l'utente in
     * sessione, che alimenta il resto dell'interfaccia. Senza, l'elenco utenti mostrerebbe
     * ancora lo stato di prima fino al ricaricamento della pagina.
     */
    const reloadEverything = async () => {
        await Promise.all([loadStatus(), refresh()]);
    };

    const handleEnabled = (codes: string[]) => {
        setRecoveryCodes(codes);
        void reloadEverything();
    };

    const handleDisable = async (password: string, code: string) => {
        try {
            await disableTwoFactor({ password, code });
            toast.success("Verifica in due passaggi disattivata");
            await reloadEverything();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile disattivare la verifica"));
            throw error;
        }
    };

    const handleRegenerate = async (password: string, code: string) => {
        try {
            const { recoveryCodes: codes } = await regenerateRecoveryCodes({ password, code });
            setRecoveryCodes(codes);
            await loadStatus();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile rigenerare i codici"));
            throw error;
        }
    };

    const isEnabled = status?.enabled ?? false;
    const remaining = status?.remainingRecoveryCodes ?? 0;

    return (
        <SettingsSection>
            <SettingsCard
                title="Verifica in due passaggi"
                description="Oltre alla password, all'accesso viene chiesto un codice generato dal tuo telefono. Una password rubata da sola non basta più per entrare."
                action={
                    status && !isEnabled ? (
                        <Button type="button" onClick={() => setIsSetupOpen(true)}>
                            <ShieldCheck className="size-4" />
                            Attiva
                        </Button>
                    ) : null
                }
            >
                {isLoading && !status ? (
                    <SettingsLoadingBox label="Caricamento impostazioni..." />
                ) : (
                    <div className="grid gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">Stato:</span>
                            <span
                                className={cn(
                                    "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                    isEnabled
                                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                        : "bg-muted text-muted-foreground"
                                )}
                            >
                                {isEnabled ? "Attiva" : "Non attiva"}
                            </span>
                        </div>

                        {isEnabled ? (
                            <>
                                <p
                                    className={cn(
                                        "text-sm",
                                        remaining === 0 ? "text-destructive" : "text-muted-foreground"
                                    )}
                                >
                                    {remaining === 0
                                        ? "Non ti resta nessun codice di recupero: se perdi il telefono non potrai più entrare da solo. Rigenerali adesso."
                                        : `Codici di recupero ancora utilizzabili: ${remaining} su 8.`}
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsRegenerateOpen(true)}
                                    >
                                        <RefreshCw className="size-4" />
                                        Rigenera codici di recupero
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsDisableOpen(true)}
                                    >
                                        <ShieldOff className="size-4" />
                                        Disattiva
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Ti servirà un&apos;app di autenticazione sul telefono, per esempio Google Authenticator,
                                Aegis o 1Password. Riceverai anche otto codici di recupero da conservare per quando il
                                telefono non è a portata di mano.
                            </p>
                        )}
                    </div>
                )}
            </SettingsCard>

            <TwoFactorSetupDialog open={isSetupOpen} onOpenChange={setIsSetupOpen} onEnabled={handleEnabled} />

            <TwoFactorConfirmDialog
                open={isDisableOpen}
                onOpenChange={setIsDisableOpen}
                title="Disattiva la verifica in due passaggi"
                description="Da quel momento per entrare basterà la password. Conferma con la password e con un codice, dell'app o di recupero."
                confirmLabel="Disattiva"
                submittingLabel="Disattivazione..."
                destructive
                onConfirm={handleDisable}
            />

            <TwoFactorConfirmDialog
                open={isRegenerateOpen}
                onOpenChange={setIsRegenerateOpen}
                title="Rigenera i codici di recupero"
                description="I codici attuali smetteranno tutti di funzionare e ne riceverai otto nuovi. Conferma con la password e con un codice, dell'app o di recupero."
                confirmLabel="Rigenera"
                submittingLabel="Rigenerazione..."
                onConfirm={handleRegenerate}
            />

            <RecoveryCodesDialog
                open={recoveryCodes !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setRecoveryCodes(null);
                    }
                }}
                codes={recoveryCodes ?? []}
            />
        </SettingsSection>
    );
};

export default SecuritySettingsSection;
