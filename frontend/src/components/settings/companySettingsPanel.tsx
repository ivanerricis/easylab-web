import { startTransition, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CustomDialog from "@/components/dialogs/customDialog";
import { FieldError, RequiredMark } from "@/components/form-field";
import { fieldErrorId, fieldProps } from "@/lib/formField";
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
    getCompanySettings,
    getLogoStatus,
    resetLogo,
    updateCompanySettings,
    uploadLogo,
    type CompanySettingsInput,
} from "@/lib/api";
import TimeZoneField from "@/components/settings/timeZoneField";
import SettingsFileInput from "@/components/settings/settingsFileInput";
import { isSettingsFormDirty } from "@/lib/settingsForm";
import { formatDateTime } from "@/lib/utils";
import { brandLogoUrl } from "@/lib/brand";
import BrandLogo from "@/components/brand-logo";

const maxLogoSizeBytes = 5 * 1024 * 1024;

/** Gli errori di validazione, ognuno sotto il proprio campo (vedi `FormField`), per id del controllo. */
type CompanyFieldErrors = Partial<Record<"companyName" | "companyTimeZone" | "logoUpload", string>>;

const defaultForm: CompanySettingsInput = {
    name: "",
    email: "",
    address: "",
    phone: "",
    timeZone: "",
};

/** Il nome canonico del fuso (`europe/rome` → `Europe/Rome`), o null se il browser non lo conosce. */
const canonicalTimeZone = (value: string): string | null => {
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).resolvedOptions().timeZone;
    } catch {
        return null;
    }
};

/** L'ora di adesso in quel fuso: la prova, per chi lo sceglie, di aver preso quello giusto. */
const currentTimeIn = (timeZone: string) =>
    new Intl.DateTimeFormat("it-IT", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date());

const CompanySettingsPanel = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formValues, setFormValues] = useState<CompanySettingsInput>(defaultForm);
    const [savedValues, setSavedValues] = useState<CompanySettingsInput>(defaultForm);
    const [errors, setErrors] = useState<CompanyFieldErrors>({});

    const [isLoadingLogo, setIsLoadingLogo] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isResettingLogo, setIsResettingLogo] = useState(false);
    const [isLogoResetConfirmOpen, setIsLogoResetConfirmOpen] = useState(false);
    const [hasCustomLogo, setHasCustomLogo] = useState(false);
    const [logoUpdatedAt, setLogoUpdatedAt] = useState<string | null>(null);

    const isDirty = isSettingsFormDirty(formValues, savedValues);
    const selectedTimeZone = formValues.timeZone.trim() ? canonicalTimeZone(formValues.timeZone) : null;

    const loadSettings = async () => {
        setIsLoading(true);

        try {
            const settings = await getCompanySettings();
            setFormValues(settings);
            setSavedValues(settings);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare i dati dell'azienda"));
        } finally {
            setIsLoading(false);
        }
    };

    const loadLogoStatus = async () => {
        setIsLoadingLogo(true);

        try {
            const status = await getLogoStatus();
            setHasCustomLogo(status.hasCustomLogo);
            setLogoUpdatedAt(status.updatedAt);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare lo stato del logo"));
        } finally {
            setIsLoadingLogo(false);
        }
    };

    useEffect(() => {
        startTransition(() => {
            void loadSettings();
            void loadLogoStatus();
        });
    }, []);

    const handleSave = async () => {
        if (isSaving || isLoading) {
            return;
        }

        const nextErrors: CompanyFieldErrors = {};

        if (!formValues.name.trim()) {
            nextErrors.companyName = "Il nome dell'azienda è obbligatorio";
        }

        if (!selectedTimeZone) {
            nextErrors.companyTimeZone = "Scegli un fuso orario dall'elenco, per esempio Europe/Rome";
        }

        // L'errore del logo non c'entra con questo pulsante: resta com'è.
        setErrors((prev) => ({ logoUpload: prev.logoUpload, ...nextErrors }));

        const firstInvalidField = (["companyName", "companyTimeZone"] as const).find((field) => nextErrors[field]);

        if (firstInvalidField) {
            document.getElementById(firstInvalidField)?.focus();
            return;
        }

        // Già fra gli errori qui sopra: il controllo serve a TypeScript, che non lo sa.
        if (!selectedTimeZone) {
            return;
        }

        try {
            setIsSaving(true);
            const settings = await updateCompanySettings({
                name: formValues.name.trim(),
                email: formValues.email.trim(),
                address: formValues.address.trim(),
                phone: formValues.phone.trim(),
                timeZone: selectedTimeZone,
            });
            setFormValues(settings);
            setSavedValues(settings);
            toast.success("Dati azienda salvati");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare i dati dell'azienda"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogoFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file) {
            return;
        }

        if (file.size > maxLogoSizeBytes) {
            setErrors((prev) => ({ ...prev, logoUpload: "Il file supera la dimensione massima di 5 MB" }));
            return;
        }

        setErrors((prev) => ({ ...prev, logoUpload: undefined }));

        try {
            setIsUploadingLogo(true);
            const status = await uploadLogo(file);
            setHasCustomLogo(status.hasCustomLogo);
            setLogoUpdatedAt(status.updatedAt);
            toast.success("Logo aggiornato con successo");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile caricare il logo"));
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const handleLogoReset = async () => {
        if (isResettingLogo) {
            return;
        }

        try {
            setIsResettingLogo(true);
            const status = await resetLogo();
            setHasCustomLogo(status.hasCustomLogo);
            setLogoUpdatedAt(status.updatedAt);
            toast.success("Logo predefinito ripristinato");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile ripristinare il logo predefinito"));
        } finally {
            setIsResettingLogo(false);
            setIsLogoResetConfirmOpen(false);
        }
    };

    const logoPreviewSrc = `${brandLogoUrl}?v=${encodeURIComponent(logoUpdatedAt ?? "default")}`;

    return (
        <SettingsSection>
            <SettingsCard
                title="Dati aziendali"
                description="Dati usati nell'intestazione dei PDF di report e interventi."
            >
                {isLoading ? (
                    <SettingsLoadingBox />
                ) : (
                    <>
                        <SettingsGroup>
                            <SettingsFieldRow>
                                <SettingsField>
                                    <Label htmlFor="companyName">
                                        Nome
                                        <RequiredMark />
                                    </Label>
                                    {/* Controllo ed errore in un blocco solo: `SettingsField` è una
                                        griglia a due righe condivise con il campo accanto, e un
                                        terzo figlio finirebbe sovrapposto al controllo. */}
                                    <div>
                                        <Input
                                            {...fieldProps("companyName", {
                                                error: errors.companyName,
                                                required: true,
                                            })}
                                            placeholder="es: EasyLab"
                                            value={formValues.name}
                                            onChange={(event) => {
                                                setFormValues((prev) => ({ ...prev, name: event.target.value }));
                                                setErrors((prev) => ({ ...prev, companyName: undefined }));
                                            }}
                                        />
                                        <FieldError id="companyName" error={errors.companyName} />
                                    </div>
                                </SettingsField>

                                <SettingsField>
                                    <Label htmlFor="companyEmail">Email</Label>
                                    <Input
                                        id="companyEmail"
                                        type="email"
                                        placeholder="es: info@easylab.local"
                                        value={formValues.email}
                                        onChange={(event) =>
                                            setFormValues((prev) => ({ ...prev, email: event.target.value }))
                                        }
                                    />
                                </SettingsField>
                            </SettingsFieldRow>

                            <SettingsFieldRow>
                                <SettingsField>
                                    <Label htmlFor="companyAddress">Indirizzo</Label>
                                    <Input
                                        id="companyAddress"
                                        placeholder="es: Via Roma 1, 00100 Roma"
                                        value={formValues.address}
                                        onChange={(event) =>
                                            setFormValues((prev) => ({ ...prev, address: event.target.value }))
                                        }
                                    />
                                </SettingsField>

                                <SettingsField>
                                    <Label htmlFor="companyPhone">Telefono</Label>
                                    <Input
                                        id="companyPhone"
                                        placeholder="es: +39 000 000 0000"
                                        value={formValues.phone}
                                        onChange={(event) =>
                                            setFormValues((prev) => ({ ...prev, phone: event.target.value }))
                                        }
                                    />
                                </SettingsField>
                            </SettingsFieldRow>

                            <SettingsFieldRow>
                                <SettingsField>
                                    <Label htmlFor="companyTimeZone">
                                        Fuso orario
                                        <RequiredMark />
                                    </Label>
                                    <div>
                                        <TimeZoneField
                                            id="companyTimeZone"
                                            value={formValues.timeZone}
                                            onValueChange={(timeZone) => {
                                                setFormValues((prev) => ({ ...prev, timeZone }));
                                                setErrors((prev) => ({ ...prev, companyTimeZone: undefined }));
                                            }}
                                            // Rosso già prima di salvare se il fuso arrivato dal server non
                                            // è riconosciuto. L'errore si aggiunge al testo d'aiuto, non
                                            // lo sostituisce: quello dice anche a cosa serve il fuso.
                                            aria-invalid={
                                                (formValues.timeZone.trim() !== "" && !selectedTimeZone) ||
                                                Boolean(errors.companyTimeZone)
                                            }
                                            aria-describedby={
                                                errors.companyTimeZone
                                                    ? `${fieldErrorId("companyTimeZone")} companyTimeZoneHint`
                                                    : "companyTimeZoneHint"
                                            }
                                        />
                                        <FieldError id="companyTimeZone" error={errors.companyTimeZone} />
                                    </div>
                                </SettingsField>
                            </SettingsFieldRow>

                            {/* Fuori dal campo, come gli altri testi d'aiuto: `SettingsField` è una
                                griglia a due righe, etichetta e controllo. */}
                            <p id="companyTimeZoneHint" className="text-xs text-muted-foreground">
                                {selectedTimeZone
                                    ? `Adesso lì sono le ${currentTimeIn(selectedTimeZone)}. `
                                    : "Fuso orario non riconosciuto. "}
                                Il fuso orario decide dove cominciano giorni e mesi: filtri per data, incassi mensili,
                                date su PDF ed email, orario dei backup automatici.
                            </p>
                        </SettingsGroup>

                        <SettingsActions>
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

            <SettingsCard
                title="Logo"
                description="Carica un'immagine per sostituire il logo mostrato nell'app e nei report PDF."
                contentClassName="@container"
            >
                {isLoadingLogo ? (
                    <SettingsLoadingBox />
                ) : (
                    // Affiancati in base alla larghezza della card, non dello schermo: a 1440px,
                    // fra barra laterale e menu delle impostazioni, `xl` scattava con la card
                    // larga poco più di 700px. Come in Email.
                    <div className="grid gap-3 @2xl:grid-cols-2">
                        <SettingsGroup title="Logo attuale">
                            <div className="flex items-center gap-4">
                                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/15 bg-background">
                                    <BrandLogo src={logoPreviewSrc} alt="Logo attuale" className="object-contain" />
                                </div>
                                <div className="grid gap-1 text-sm text-muted-foreground">
                                    <p>{hasCustomLogo ? "Logo personalizzato attivo" : "Logo predefinito attivo"}</p>
                                    {logoUpdatedAt ? (
                                        <p>Ultimo aggiornamento: {formatDateTime(logoUpdatedAt)}</p>
                                    ) : null}
                                </div>
                            </div>

                            <SettingsActions>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!hasCustomLogo || isResettingLogo || isUploadingLogo}
                                    onClick={() => setIsLogoResetConfirmOpen(true)}
                                >
                                    <RotateCcw className="size-4" />
                                    {isResettingLogo ? "Ripristino..." : "Ripristina logo predefinito"}
                                </Button>

                                <CustomDialog
                                    open={isLogoResetConfirmOpen}
                                    onOpenChange={(nextOpen) => {
                                        if (!isResettingLogo) {
                                            setIsLogoResetConfirmOpen(nextOpen);
                                        }
                                    }}
                                    title="Ripristina logo predefinito"
                                    description="Il logo personalizzato attuale verrà rimosso e sostituito da quello predefinito. Se non hai più il file originale, dovrai crearlo di nuovo per ricaricarlo."
                                    destructive
                                    confirmLabel={isResettingLogo ? "Ripristino..." : "Ripristina"}
                                    confirmIcon={RotateCcw}
                                    confirmDisabled={isResettingLogo}
                                    cancelDisabled={isResettingLogo}
                                    onCancel={() => setIsLogoResetConfirmOpen(false)}
                                    onConfirm={() => void handleLogoReset()}
                                />
                            </SettingsActions>
                        </SettingsGroup>

                        <SettingsGroup title="Sostituisci logo">
                            <div className="grid gap-2">
                                <SettingsFileInput
                                    id="logoUpload"
                                    label="Carica nuovo logo"
                                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                                    disabled={isUploadingLogo}
                                    onChange={(event) => void handleLogoFileSelected(event)}
                                    status={isUploadingLogo ? "Caricamento in corso..." : undefined}
                                />
                                {/* Con `role="alert"` si legge appena compare: il pulsante di
                                    `SettingsFileInput` ha già la sua descrizione (etichetta e file
                                    scelto), e non gli si può aggiungere questa. */}
                                <FieldError id="logoUpload" error={errors.logoUpload} />
                                <p className="text-xs text-muted-foreground">
                                    Formati supportati: JPG, PNG, WEBP, GIF, SVG. Dimensione massima 5 MB. Il logo viene
                                    applicato subito dopo il caricamento.
                                </p>
                            </div>
                        </SettingsGroup>
                    </div>
                )}
            </SettingsCard>
        </SettingsSection>
    );
};

export default CompanySettingsPanel;
