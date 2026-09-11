import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    SettingsActions,
    SettingsCard,
    SettingsField,
    SettingsFieldRow,
    SettingsGroup,
    SettingsLoadingBox,
    SettingsSection,
} from "@/components/settings/settingsUi";
import {
    getApiErrorMessage,
    getEmailSettings,
    testEmailConnection,
    updateEmailSettings,
    type EmailSettingsInput,
} from "@/lib/api";
import { isSettingsFormDirty } from "@/lib/settingsForm";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const defaultForm: EmailSettingsInput = {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    username: "",
    fromName: "",
    fromEmail: "",
    password: "",
};

const EmailSettingsPanel = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [formValues, setFormValues] = useState<EmailSettingsInput>(defaultForm);
    const [savedValues, setSavedValues] = useState<EmailSettingsInput>(defaultForm);
    const [passwordSet, setPasswordSet] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const isDirty = isSettingsFormDirty(formValues, savedValues, ["password"]);

    const loadSettings = async () => {
        setIsLoading(true);

        try {
            const settings = await getEmailSettings();
            const nextValues: EmailSettingsInput = {
                enabled: settings.enabled,
                host: settings.host,
                port: settings.port,
                secure: settings.secure,
                username: settings.username,
                fromName: settings.fromName,
                fromEmail: settings.fromEmail,
                password: "",
            };
            setFormValues(nextValues);
            setSavedValues(nextValues);
            setPasswordSet(settings.passwordSet);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare le impostazioni email"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        startTransition(() => {
            void loadSettings();
        });
    }, []);

    const handleSave = async () => {
        if (isSaving || isLoading) {
            return;
        }

        if (formValues.enabled) {
            if (!formValues.host.trim() || !formValues.username.trim() || !formValues.fromEmail.trim()) {
                toast.error("Specifica almeno host, utente ed email mittente");
                return;
            }

            if (!emailPattern.test(formValues.fromEmail.trim())) {
                toast.error("L'email mittente non è valida");
                return;
            }

            if (!Number.isInteger(formValues.port) || formValues.port <= 0 || formValues.port > 65535) {
                toast.error("La porta SMTP deve essere un numero valido");
                return;
            }

            if (!passwordSet && !formValues.password?.trim()) {
                toast.error("Specifica una password per l'account email");
                return;
            }
        }

        try {
            setIsSaving(true);
            const settings = await updateEmailSettings({
                ...formValues,
                host: formValues.host.trim(),
                username: formValues.username.trim(),
                fromName: formValues.fromName.trim(),
                fromEmail: formValues.fromEmail.trim(),
            });

            setPasswordSet(settings.passwordSet);
            const nextSavedValues: EmailSettingsInput = {
                enabled: settings.enabled,
                host: settings.host,
                port: settings.port,
                secure: settings.secure,
                username: settings.username,
                fromName: settings.fromName,
                fromEmail: settings.fromEmail,
                password: "",
            };
            // Il form prende i valori salvati (ripuliti dagli spazi): altrimenti restava
            // "modificato" subito dopo il salvataggio. Vedi lo stesso punto in `useBackupPanel`.
            setFormValues(nextSavedValues);
            setSavedValues(nextSavedValues);
            toast.success("Impostazioni email salvate");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare le impostazioni email"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestConnection = async () => {
        if (isTesting) {
            return;
        }

        if (!formValues.host.trim() || !formValues.username.trim()) {
            toast.error("Per testare la connessione specifica almeno host e utente");
            return;
        }

        const fromEmail = formValues.fromEmail.trim();

        if (!fromEmail || !emailPattern.test(fromEmail)) {
            toast.error("Inserisci un'email mittente valida per testare l'invio");
            return;
        }

        const password = formValues.password?.trim();

        if (!password) {
            toast.error("Inserisci la password nel campo qui sopra per testare la connessione");
            return;
        }

        try {
            setIsTesting(true);
            const result = await testEmailConnection({
                host: formValues.host.trim(),
                port: formValues.port,
                secure: formValues.secure,
                username: formValues.username.trim(),
                password,
                fromName: formValues.fromName.trim(),
                fromEmail,
            });
            toast.success(result.message);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Invio email di test non riuscito"));
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <SettingsSection>
            <SettingsCard
                title="Email"
                description="Configura il server SMTP usato per inviare gli interventi ai clienti."
            >
                {isLoading ? (
                    <SettingsLoadingBox />
                ) : (
                    <>
                        <SettingsGroup>
                            <div className="flex items-center gap-3">
                                <Checkbox
                                    id="emailEnabled"
                                    checked={formValues.enabled}
                                    onCheckedChange={(checked) =>
                                        setFormValues((prev) => ({ ...prev, enabled: Boolean(checked) }))
                                    }
                                />
                                <Label htmlFor="emailEnabled" className="cursor-pointer">
                                    Abilita invio email ai clienti
                                </Label>
                            </div>
                        </SettingsGroup>

                        <div className="grid gap-3 xl:grid-cols-2">
                            <SettingsGroup title="Server SMTP">
                                <SettingsFieldRow>
                                    <SettingsField>
                                        <Label htmlFor="emailHost">Host SMTP</Label>
                                        <Input
                                            id="emailHost"
                                            placeholder="es: smtp.example.com"
                                            disabled={!formValues.enabled}
                                            value={formValues.host}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, host: event.target.value }))
                                            }
                                        />
                                    </SettingsField>

                                    <SettingsField>
                                        <Label htmlFor="emailPort">Porta</Label>
                                        <Input
                                            id="emailPort"
                                            type="number"
                                            min={1}
                                            max={65535}
                                            disabled={!formValues.enabled}
                                            value={formValues.port}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, port: Number(event.target.value) }))
                                            }
                                        />
                                    </SettingsField>
                                </SettingsFieldRow>

                                <div className="flex items-center gap-3">
                                    <Checkbox
                                        id="emailSecure"
                                        checked={formValues.secure}
                                        disabled={!formValues.enabled}
                                        onCheckedChange={(checked) =>
                                            setFormValues((prev) => ({ ...prev, secure: Boolean(checked) }))
                                        }
                                    />
                                    <Label htmlFor="emailSecure" className="cursor-pointer">
                                        Connessione sicura (TLS/SSL)
                                    </Label>
                                </div>

                                <SettingsFieldRow>
                                    <SettingsField>
                                        <Label htmlFor="emailUsername">Utente</Label>
                                        <Input
                                            id="emailUsername"
                                            disabled={!formValues.enabled}
                                            value={formValues.username}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, username: event.target.value }))
                                            }
                                        />
                                    </SettingsField>

                                    <SettingsField>
                                        <Label htmlFor="emailPassword">Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="emailPassword"
                                                type={isPasswordVisible ? "text" : "password"}
                                                autoComplete="off"
                                                placeholder={passwordSet ? "•••• (invariata)" : ""}
                                                disabled={!formValues.enabled}
                                                value={formValues.password ?? ""}
                                                onChange={(event) =>
                                                    setFormValues((prev) => ({ ...prev, password: event.target.value }))
                                                }
                                                className="pr-9"
                                            />
                                            <div className="absolute inset-y-0 right-1.5 flex items-center">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    disabled={!formValues.enabled}
                                                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                                                    aria-label={
                                                        isPasswordVisible ? "Nascondi password" : "Mostra password"
                                                    }
                                                >
                                                    {isPasswordVisible ? (
                                                        <EyeOff className="size-4" />
                                                    ) : (
                                                        <Eye className="size-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </SettingsField>
                                </SettingsFieldRow>

                                <p className="text-xs text-muted-foreground">
                                    La password viene salvata cifrata. Lasciala vuota al salvataggio per mantenere
                                    quella già impostata.
                                </p>
                            </SettingsGroup>

                            <SettingsGroup title="Mittente">
                                <SettingsFieldRow>
                                    <SettingsField>
                                        <Label htmlFor="emailFromName">Nome mittente</Label>
                                        <Input
                                            id="emailFromName"
                                            placeholder="es: EasyLab"
                                            disabled={!formValues.enabled}
                                            value={formValues.fromName}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, fromName: event.target.value }))
                                            }
                                        />
                                    </SettingsField>

                                    <SettingsField>
                                        <Label htmlFor="emailFromAddress">Email mittente</Label>
                                        <Input
                                            id="emailFromAddress"
                                            type="email"
                                            placeholder="es: info@easylab.local"
                                            disabled={!formValues.enabled}
                                            value={formValues.fromEmail}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, fromEmail: event.target.value }))
                                            }
                                        />
                                    </SettingsField>
                                </SettingsFieldRow>

                                <p className="text-xs text-muted-foreground">
                                    Indirizzo che i clienti vedranno come mittente degli interventi ricevuti.
                                </p>
                            </SettingsGroup>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            "Testa connessione" invia una vera email di prova all'indirizzo mittente configurato, per
                            verificare che l'invio funzioni davvero prima di salvare.
                        </p>

                        <SettingsActions>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!formValues.enabled || isTesting}
                                onClick={() => void handleTestConnection()}
                            >
                                {isTesting ? "Invio email di test..." : "Testa connessione"}
                            </Button>
                            <Button
                                type="button"
                                disabled={isSaving || isLoading || !isDirty}
                                onClick={() => void handleSave()}
                            >
                                {isSaving ? "Salvataggio..." : "Salva impostazioni"}
                            </Button>
                        </SettingsActions>
                    </>
                )}
            </SettingsCard>
        </SettingsSection>
    );
};

export default EmailSettingsPanel;
