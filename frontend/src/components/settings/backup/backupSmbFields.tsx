import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, RequiredMark } from "@/components/form-field";
import { SettingsActions, SettingsField, SettingsFieldRow, SettingsGroup } from "@/components/settings/settingsUi";
import { fieldProps } from "@/lib/formField";
import type { BackupPanel } from "./useBackupPanel";

const BackupSmbFields = ({ panel }: { panel: BackupPanel }) => {
    const { formValues, changeFormValues, errors, smbPasswordSet, isTestingSmb } = panel;
    // Obbligatori solo con la copia sul NAS attiva: da spenta i campi sono disattivati e non si
    // validano. La password solo la prima volta: dopo, vuota vuol dire "tieni quella salvata".
    const isRequired = formValues.smbEnabled;
    const isPasswordRequired = isRequired && !smbPasswordSet;

    return (
        <SettingsGroup title="Destinazione di rete (NAS)">
            {/* `items-start` e `leading-snug`: vedi le caselle di `BackupScheduleFields`. */}
            <div className="flex items-start gap-3">
                <Checkbox
                    id="smbEnabled"
                    checked={formValues.smbEnabled}
                    onCheckedChange={(checked) => changeFormValues({ smbEnabled: Boolean(checked) })}
                />
                <Label htmlFor="smbEnabled" className="cursor-pointer leading-snug">
                    Copia ogni backup su una condivisione SMB/CIFS
                </Label>
            </div>

            <SettingsFieldRow>
                <SettingsField>
                    <Label htmlFor="smbHost">
                        Host / IP del NAS
                        {isRequired ? <RequiredMark /> : null}
                    </Label>
                    {/* Controllo ed errore in un blocco solo: vedi `BackupScheduleFields`. */}
                    <div>
                        <Input
                            {...fieldProps("smbHost", { error: errors.smbHost, required: isRequired })}
                            placeholder="es: 192.168.1.10"
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbHost}
                            onChange={(event) => changeFormValues({ smbHost: event.target.value })}
                        />
                        <FieldError id="smbHost" error={errors.smbHost} />
                    </div>
                </SettingsField>

                <SettingsField>
                    <Label htmlFor="smbShare">
                        Nome condivisione
                        {isRequired ? <RequiredMark /> : null}
                    </Label>
                    <div>
                        <Input
                            {...fieldProps("smbShare", { error: errors.smbShare, required: isRequired })}
                            placeholder="es: backup"
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbShare}
                            onChange={(event) => changeFormValues({ smbShare: event.target.value })}
                        />
                        <FieldError id="smbShare" error={errors.smbShare} />
                    </div>
                </SettingsField>
            </SettingsFieldRow>

            <SettingsFieldRow>
                <SettingsField>
                    <Label htmlFor="smbPath">Sottocartella (opzionale)</Label>
                    <Input
                        id="smbPath"
                        placeholder="es: easylab-web"
                        disabled={!formValues.smbEnabled}
                        value={formValues.smbPath}
                        onChange={(event) => changeFormValues({ smbPath: event.target.value })}
                    />
                </SettingsField>

                <SettingsField>
                    <Label htmlFor="smbPort">Porta</Label>
                    <div>
                        <Input
                            {...fieldProps("smbPort", { error: errors.smbPort })}
                            type="number"
                            min={1}
                            max={65535}
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbPort}
                            onChange={(event) => changeFormValues({ smbPort: Number(event.target.value) })}
                        />
                        <FieldError id="smbPort" error={errors.smbPort} />
                    </div>
                </SettingsField>
            </SettingsFieldRow>

            <SettingsFieldRow>
                <SettingsField>
                    <Label htmlFor="smbDomain">Dominio/Workgroup (opzionale)</Label>
                    <Input
                        id="smbDomain"
                        placeholder="es: WORKGROUP"
                        disabled={!formValues.smbEnabled}
                        value={formValues.smbDomain}
                        onChange={(event) => changeFormValues({ smbDomain: event.target.value })}
                    />
                </SettingsField>

                <SettingsField>
                    <Label htmlFor="smbUsername">
                        Utente
                        {isRequired ? <RequiredMark /> : null}
                    </Label>
                    <div>
                        <Input
                            {...fieldProps("smbUsername", { error: errors.smbUsername, required: isRequired })}
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbUsername}
                            onChange={(event) => changeFormValues({ smbUsername: event.target.value })}
                        />
                        <FieldError id="smbUsername" error={errors.smbUsername} />
                    </div>
                </SettingsField>
            </SettingsFieldRow>

            <div className="grid gap-2">
                <Label htmlFor="smbPassword">
                    Password
                    {isPasswordRequired ? <RequiredMark /> : null}
                </Label>
                <div>
                    <Input
                        {...fieldProps("smbPassword", { error: errors.smbPassword, required: isPasswordRequired })}
                        type="password"
                        autoComplete="new-password"
                        placeholder={smbPasswordSet ? "•••• (invariata, lascia vuoto)" : ""}
                        disabled={!formValues.smbEnabled}
                        value={formValues.smbPassword ?? ""}
                        onChange={(event) => changeFormValues({ smbPassword: event.target.value })}
                    />
                    <FieldError id="smbPassword" error={errors.smbPassword} />
                </div>
                <p className="text-xs text-muted-foreground">
                    La password viene salvata cifrata. Lasciala vuota al salvataggio per mantenere quella già impostata.
                </p>
            </div>

            <SettingsActions>
                <Button
                    type="button"
                    variant="outline"
                    disabled={!formValues.smbEnabled || isTestingSmb}
                    onClick={() => void panel.handleTestSmbConnection()}
                >
                    <PlugZap className="size-4" />
                    {isTestingSmb ? "Test in corso..." : "Testa connessione"}
                </Button>
            </SettingsActions>
        </SettingsGroup>
    );
};

export default BackupSmbFields;
