import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, RequiredMark } from "@/components/form-field";
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
    type EmailSettingsDto,
    type EmailSettingsInput,
} from "@/lib/api";
import { fieldProps } from "@/lib/formField";
import { isSettingsFormDirty } from "@/lib/settingsForm";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { isValidEmail } from "@/lib/utils";

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

/** Gli errori di validazione per id del controllo, ognuno sotto il proprio campo (vedi `FormField`). */
type EmailField = "emailHost" | "emailPort" | "emailUsername" | "emailPassword" | "emailFromAddress";
type EmailFieldErrors = Partial<Record<EmailField, string>>;

/** Nell'ordine in cui i campi stanno nella pagina: il primo sbagliato riceve il focus. */
const emailFieldOrder: EmailField[] = ["emailHost", "emailPort", "emailUsername", "emailPassword", "emailFromAddress"];

/**
 * I campi del modulo letti dal DTO del server. Prima questa stessa conversione era scritta due
 * volte, identica, nel caricamento e nel salvataggio. La password riparte vuota: il server non
 * la restituisce mai, e vuota vuol dire "tieni quella salvata".
 */
const toFormValues = (settings: EmailSettingsDto): EmailSettingsInput => ({
    enabled: settings.enabled,
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    username: settings.username,
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    password: "",
});

/** Obbligatori solo con l'invio attivo: da spento i campi sono disattivati e non si validano. */
const validateEmailForm = (values: EmailSettingsInput, settings: EmailSettingsDto | null): EmailFieldErrors => {
    const nextErrors: EmailFieldErrors = {};

    if (!values.enabled) {
        return nextErrors;
    }

    if (!values.host.trim()) {
        nextErrors.emailHost = "Specifica l'host SMTP";
    }

    if (!Number.isInteger(values.port) || values.port <= 0 || values.port > 65535) {
        nextErrors.emailPort = "La porta SMTP deve essere un numero valido";
    }

    if (!values.username.trim()) {
        nextErrors.emailUsername = "Specifica l'utente dell'account email";
    }

    if (!settings?.passwordSet && !values.password?.trim()) {
        nextErrors.emailPassword = "Specifica una password per l'account email";
    }

    const fromEmail = values.fromEmail.trim();

    if (!fromEmail) {
        nextErrors.emailFromAddress = "Specifica l'email mittente";
    } else if (!isValidEmail(fromEmail)) {
        nextErrors.emailFromAddress = "L'email mittente non è valida";
    }

    return nextErrors;
};

type Props = {
    /** Chiamata a ogni cambio di "ci sono modifiche non salvate", e con `false` allo smontaggio. */
    onDirtyChange?: (isDirty: boolean) => void;
};

const EmailSettingsPanel = ({ onDirtyChange }: Props) => {
    const {
        data: settings,
        formValues,
        setFormValues,
        isDirty,
        isLoading,
        isSaving,
        errors,
        setErrors,
        reportErrors,
        handleSave,
    } = useSettingsForm({
        load: getEmailSettings,
        save: (values) =>
            updateEmailSettings({
                ...values,
                host: values.host.trim(),
                username: values.username.trim(),
                fromName: values.fromName.trim(),
                fromEmail: values.fromEmail.trim(),
            }),
        toForm: toFormValues,
        defaultValues: defaultForm,
        validate: validateEmailForm,
        fieldOrder: emailFieldOrder,
        // La password non torna mai dal server: scriverne una nuova è di per sé una modifica.
        isDirty: (current, saved) => isSettingsFormDirty(current, saved, ["password"]),
        onDirtyChange,
        messages: {
            loadError: "Impossibile caricare le impostazioni email",
            saveError: "Impossibile salvare le impostazioni email",
            saved: "Impostazioni email salvate",
        },
    });
    const [isTesting, setIsTesting] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const passwordSet = settings?.passwordSet ?? false;

    /** Aggiorna un campo e ne toglie l'errore: chi lo sta correggendo non deve rivederlo. */
    const changeField = (field: EmailField, values: Partial<EmailSettingsInput>) => {
        setFormValues((prev) => ({ ...prev, ...values }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    // Obbligatori solo con l'invio attivo: da spento i campi sono disattivati e non si validano.
    const isRequired = formValues.enabled;

    const handleTestConnection = async () => {
        if (isTesting) {
            return;
        }

        const fromEmail = formValues.fromEmail.trim();
        const password = formValues.password?.trim();
        const nextErrors: EmailFieldErrors = {};

        if (!formValues.host.trim()) {
            nextErrors.emailHost = "Per testare la connessione specifica l'host SMTP";
        }

        if (!formValues.username.trim()) {
            nextErrors.emailUsername = "Per testare la connessione specifica l'utente";
        }

        // Anche con una password già salvata: quella resta sul server, la prova usa la scritta.
        if (!password) {
            nextErrors.emailPassword = "Per testare la connessione scrivi la password";
        }

        if (!fromEmail || !isValidEmail(fromEmail)) {
            nextErrors.emailFromAddress = "Inserisci un'email mittente valida per testare l'invio";
        }

        // `!password` è già fra gli errori: qui serve a TypeScript, che non lo sa.
        if (reportErrors(nextErrors) || !password) {
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
            {/* Senza descrizione: ripeteva quella della voce nel menu delle impostazioni. */}
            <SettingsCard title="Email" contentClassName="@container">
                {isLoading ? (
                    <SettingsLoadingBox />
                ) : (
                    <>
                        <SettingsGroup>
                            {/* `items-start` e `leading-snug`, come nel dialogo di ripristino del
                                backup: su un telefono l'etichetta va a capo, e con `leading-none`
                                le righe si toccavano e la casella finiva a metà testo. */}
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    id="emailEnabled"
                                    checked={formValues.enabled}
                                    onCheckedChange={(checked) => {
                                        setFormValues((prev) => ({ ...prev, enabled: Boolean(checked) }));
                                        // Da spento non si valida niente, e da riacceso si riparte puliti.
                                        setErrors({});
                                    }}
                                />
                                <Label htmlFor="emailEnabled" className="cursor-pointer leading-snug">
                                    Abilita invio email ai clienti
                                </Label>
                            </div>
                        </SettingsGroup>

                        {/* I due gruppi affiancati solo con la card larga almeno 1024px: il
                            breakpoint è della card, non dello schermo. Con `xl` a 1440px (barra
                            laterale e menu delle impostazioni aperti) i gruppi si dividevano ~700px
                            e ognuno li ridivideva in due colonne: sei campi larghi 164px, con
                            host e indirizzo mittente tagliati. */}
                        <div className="grid gap-3 @5xl:grid-cols-2">
                            <SettingsGroup title="Server SMTP">
                                <SettingsFieldRow>
                                    <SettingsField>
                                        <Label htmlFor="emailHost">
                                            Host SMTP
                                            {isRequired ? <RequiredMark /> : null}
                                        </Label>
                                        {/* Controllo ed errore in un blocco solo: `SettingsField` è
                                            una griglia a due righe condivise con il campo accanto, e
                                            un terzo figlio finirebbe sovrapposto al controllo. */}
                                        <div>
                                            <Input
                                                {...fieldProps("emailHost", {
                                                    error: errors.emailHost,
                                                    required: isRequired,
                                                })}
                                                placeholder="es: smtp.example.com"
                                                disabled={!formValues.enabled}
                                                value={formValues.host}
                                                onChange={(event) =>
                                                    changeField("emailHost", { host: event.target.value })
                                                }
                                            />
                                            <FieldError id="emailHost" error={errors.emailHost} />
                                        </div>
                                    </SettingsField>

                                    <SettingsField>
                                        <Label htmlFor="emailPort">Porta</Label>
                                        <div>
                                            <Input
                                                {...fieldProps("emailPort", { error: errors.emailPort })}
                                                type="number"
                                                min={1}
                                                max={65535}
                                                disabled={!formValues.enabled}
                                                value={formValues.port}
                                                onChange={(event) =>
                                                    changeField("emailPort", { port: Number(event.target.value) })
                                                }
                                            />
                                            <FieldError id="emailPort" error={errors.emailPort} />
                                        </div>
                                    </SettingsField>
                                </SettingsFieldRow>

                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="emailSecure"
                                        checked={formValues.secure}
                                        disabled={!formValues.enabled}
                                        onCheckedChange={(checked) =>
                                            setFormValues((prev) => ({ ...prev, secure: Boolean(checked) }))
                                        }
                                    />
                                    <Label htmlFor="emailSecure" className="cursor-pointer leading-snug">
                                        Connessione sicura (TLS/SSL)
                                    </Label>
                                </div>

                                <SettingsFieldRow>
                                    <SettingsField>
                                        <Label htmlFor="emailUsername">
                                            Utente
                                            {isRequired ? <RequiredMark /> : null}
                                        </Label>
                                        <div>
                                            <Input
                                                {...fieldProps("emailUsername", {
                                                    error: errors.emailUsername,
                                                    required: isRequired,
                                                })}
                                                disabled={!formValues.enabled}
                                                value={formValues.username}
                                                onChange={(event) =>
                                                    changeField("emailUsername", { username: event.target.value })
                                                }
                                            />
                                            <FieldError id="emailUsername" error={errors.emailUsername} />
                                        </div>
                                    </SettingsField>

                                    <SettingsField>
                                        {/* Obbligatoria solo la prima volta: dopo, vuota vuol dire
                                            "tieni quella salvata". */}
                                        <Label htmlFor="emailPassword">
                                            Password
                                            {isRequired && !passwordSet ? <RequiredMark /> : null}
                                        </Label>
                                        <div>
                                            <div className="relative">
                                                <Input
                                                    {...fieldProps("emailPassword", {
                                                        error: errors.emailPassword,
                                                        required: isRequired && !passwordSet,
                                                    })}
                                                    type={isPasswordVisible ? "text" : "password"}
                                                    autoComplete="off"
                                                    placeholder={passwordSet ? "•••• (invariata)" : ""}
                                                    disabled={!formValues.enabled}
                                                    value={formValues.password ?? ""}
                                                    onChange={(event) =>
                                                        changeField("emailPassword", { password: event.target.value })
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
                                            <FieldError id="emailPassword" error={errors.emailPassword} />
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
                                        <Label htmlFor="emailFromAddress">
                                            Email mittente
                                            {isRequired ? <RequiredMark /> : null}
                                        </Label>
                                        <div>
                                            <Input
                                                {...fieldProps("emailFromAddress", {
                                                    error: errors.emailFromAddress,
                                                    required: isRequired,
                                                })}
                                                type="email"
                                                placeholder="es: info@easylab.local"
                                                disabled={!formValues.enabled}
                                                value={formValues.fromEmail}
                                                onChange={(event) =>
                                                    changeField("emailFromAddress", { fromEmail: event.target.value })
                                                }
                                            />
                                            <FieldError id="emailFromAddress" error={errors.emailFromAddress} />
                                        </div>
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
                                <Send className="size-4" />
                                {isTesting ? "Invio email di test..." : "Testa connessione"}
                            </Button>
                            <Button
                                type="button"
                                disabled={isSaving || isLoading || !isDirty}
                                onClick={() => void handleSave()}
                            >
                                <Save className="size-4" />
                                {isSaving ? "Salvataggio..." : "Salva"}
                            </Button>
                        </SettingsActions>
                    </>
                )}
            </SettingsCard>
        </SettingsSection>
    );
};

export default EmailSettingsPanel;
