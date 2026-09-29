import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FormField, { FieldError } from "@/components/form-field";
import DetailItem, { DetailGrid } from "@/components/detail-item";
import { SettingsField, SettingsFieldRow, SettingsGroup } from "@/components/settings/settingsUi";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import { cn } from "@/lib/utils";
import type { BackupPanel } from "./useBackupPanel";

const BackupScheduleFields = ({ panel }: { panel: BackupPanel }) => {
    const { formValues, changeFormValues, errors, emailConfigured } = panel;

    return (
        <SettingsGroup title="Pianificazione">
            {/* `items-start` e `leading-snug` sulle caselle, come nel dialogo di ripristino: su un
                telefono le etichette vanno a capo, e con `leading-none` le righe si toccavano e la
                casella finiva a metà testo. */}
            <div className="flex items-start gap-3">
                <Checkbox
                    id="autoEnabled"
                    checked={formValues.autoEnabled}
                    onCheckedChange={(checked) => changeFormValues({ autoEnabled: Boolean(checked) })}
                />
                <Label htmlFor="autoEnabled" className="cursor-pointer leading-snug">
                    Esegui dump in automatico
                </Label>
            </div>

            {/* Le etichette restano piccole come nel resto delle Impostazioni (`FormField` di serie le
                fa `text-lg`, la misura dei dialoghi). `contents` toglie il contenitore di
                `FormField`: etichetta e blocco controllo+errore diventano le due righe di
                `SettingsField`, che le allinea con il campo accanto (subgrid); con un contenitore
                in mezzo l'allineamento si perderebbe. */}
            <SettingsFieldRow>
                <SettingsField>
                    <FormField
                        id="frequencyDays"
                        label="Ogni quanti giorni"
                        error={errors.frequencyDays}
                        className="contents"
                        labelSize="sm"
                        groupControlAndError
                    >
                        <Input
                            {...fieldProps("frequencyDays", { error: errors.frequencyDays })}
                            type="number"
                            min={1}
                            max={365}
                            disabled={!formValues.autoEnabled}
                            value={formValues.frequencyDays}
                            onChange={(event) => changeFormValues({ frequencyDays: Number(event.target.value) })}
                        />
                    </FormField>
                </SettingsField>

                <SettingsField>
                    <FormField
                        id="runAt"
                        label="Orario"
                        error={errors.runAt}
                        className="contents"
                        labelSize="sm"
                        groupControlAndError
                    >
                        <Input
                            {...fieldProps("runAt", { error: errors.runAt })}
                            type="time"
                            disabled={!formValues.autoEnabled}
                            value={formValues.runAt}
                            onChange={(event) => changeFormValues({ runAt: event.target.value })}
                        />
                    </FormField>
                </SettingsField>
            </SettingsFieldRow>

            <FormField
                id="maxBackupsToKeep"
                label="Numero di backup da mantenere"
                error={errors.maxBackupsToKeep}
                className="gap-2"
                labelSize="sm"
                groupControlAndError
                description="I dump più vecchi oltre questo numero vengono eliminati automaticamente ad ogni nuovo backup."
            >
                <Input
                    {...fieldProps("maxBackupsToKeep", { error: errors.maxBackupsToKeep })}
                    type="number"
                    min={1}
                    max={365}
                    value={formValues.maxBackupsToKeep}
                    onChange={(event) => changeFormValues({ maxBackupsToKeep: Number(event.target.value) })}
                />
            </FormField>

            <div className="grid gap-2">
                {/* Senza email configurata l'avviso non si può accendere, ma deve potersi spegnere:
                    se era stato salvato acceso e poi l'invio email è stato disattivato, la casella
                    restava spuntata e bloccata, e il salvataggio rifiutato per un errore che non
                    si poteva correggere. Spenta, si blocca. */}
                <div className="flex items-start gap-3">
                    <Checkbox
                        id="notifyEmailOnFailure"
                        {...fieldErrorAria("notifyEmailOnFailure", errors.notifyEmailOnFailure)}
                        checked={formValues.notifyEmailOnFailure}
                        disabled={!emailConfigured && !formValues.notifyEmailOnFailure}
                        onCheckedChange={(checked) => changeFormValues({ notifyEmailOnFailure: Boolean(checked) })}
                    />
                    <Label
                        htmlFor="notifyEmailOnFailure"
                        className={cn(
                            "cursor-pointer leading-snug",
                            !emailConfigured && !formValues.notifyEmailOnFailure && "text-muted-foreground"
                        )}
                    >
                        Invia una email se il backup automatico non va a buon fine
                    </Label>
                </div>
                <FieldError id="notifyEmailOnFailure" error={errors.notifyEmailOnFailure} />
                <p className="text-xs text-muted-foreground">
                    {emailConfigured ? (
                        <>L&apos;avviso viene inviato all&apos;email aziendale configurata in Azienda.</>
                    ) : (
                        <>
                            Configura prima l&apos;invio email nella sezione{" "}
                            <Link to="/settings?section=email" className="underline underline-offset-2">
                                Email
                            </Link>{" "}
                            per attivare questo avviso.
                        </>
                    )}
                </p>
            </div>

            <div className="grid gap-1">
                <DetailGrid layout="rows">
                    <DetailItem
                        label="Cartella dump sul server"
                        value={<span className="font-mono break-all">{panel.outputDir || "-"}</span>}
                    />
                </DetailGrid>
                <p className="text-xs text-muted-foreground">
                    Definita dalla configurazione del compose/.env, non modificabile da qui.
                </p>
            </div>
        </SettingsGroup>
    );
};

export default BackupScheduleFields;
