import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsField, SettingsFieldRow, SettingsGroup } from "@/components/settings/settingsUi";
import { cn } from "@/lib/utils";
import type { BackupPanel } from "./useBackupPanel";

const BackupScheduleFields = ({ panel }: { panel: BackupPanel }) => {
    const { formValues, setFormValues, emailConfigured } = panel;

    return (
        <SettingsGroup title="Pianificazione">
            {/* `items-start` e `leading-snug` sulle caselle, come nel dialogo di ripristino: su un
                telefono le etichette vanno a capo, e con `leading-none` le righe si toccavano e la
                casella finiva a metà testo. */}
            <div className="flex items-start gap-3">
                <Checkbox
                    id="autoEnabled"
                    checked={formValues.autoEnabled}
                    onCheckedChange={(checked) =>
                        setFormValues((prev) => ({
                            ...prev,
                            autoEnabled: Boolean(checked),
                        }))
                    }
                />
                <Label htmlFor="autoEnabled" className="cursor-pointer leading-snug">
                    Esegui dump in automatico
                </Label>
            </div>

            <SettingsFieldRow>
                <SettingsField>
                    <Label htmlFor="frequencyDays">Ogni quanti giorni</Label>
                    <Input
                        id="frequencyDays"
                        type="number"
                        min={1}
                        max={365}
                        disabled={!formValues.autoEnabled}
                        value={formValues.frequencyDays}
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                frequencyDays: Number(event.target.value),
                            }))
                        }
                    />
                </SettingsField>

                <SettingsField>
                    <Label htmlFor="runAt">Orario</Label>
                    <Input
                        id="runAt"
                        type="time"
                        disabled={!formValues.autoEnabled}
                        value={formValues.runAt}
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                runAt: event.target.value,
                            }))
                        }
                    />
                </SettingsField>
            </SettingsFieldRow>

            <div className="grid gap-2">
                <Label htmlFor="maxBackupsToKeep">Numero di backup da mantenere</Label>
                <Input
                    id="maxBackupsToKeep"
                    type="number"
                    min={1}
                    max={365}
                    value={formValues.maxBackupsToKeep}
                    onChange={(event) =>
                        setFormValues((prev) => ({
                            ...prev,
                            maxBackupsToKeep: Number(event.target.value),
                        }))
                    }
                />
                <p className="text-xs text-muted-foreground">
                    I dump più vecchi oltre questo numero vengono eliminati automaticamente ad ogni nuovo backup.
                </p>
            </div>

            <div className="grid gap-2">
                <div className="flex items-start gap-3">
                    <Checkbox
                        id="notifyEmailOnFailure"
                        checked={formValues.notifyEmailOnFailure}
                        disabled={!emailConfigured}
                        onCheckedChange={(checked) =>
                            setFormValues((prev) => ({
                                ...prev,
                                notifyEmailOnFailure: Boolean(checked),
                            }))
                        }
                    />
                    <Label
                        htmlFor="notifyEmailOnFailure"
                        className={cn("cursor-pointer leading-snug", !emailConfigured && "text-muted-foreground")}
                    >
                        Invia una email se il backup automatico non va a buon fine
                    </Label>
                </div>
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
                <span className="text-sm font-medium">Cartella dump sul server</span>
                <p className="font-mono text-sm break-all">{panel.outputDir || "-"}</p>
                <p className="text-xs text-muted-foreground">
                    Definita dalla configurazione del compose/.env, non modificabile da qui.
                </p>
            </div>
        </SettingsGroup>
    );
};

export default BackupScheduleFields;
