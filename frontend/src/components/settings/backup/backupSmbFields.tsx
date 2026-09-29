import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FormField from "@/components/form-field";
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

            {/* Etichette piccole e `className="contents"`: vedi i campi di `BackupScheduleFields`. */}
            <SettingsFieldRow>
                <SettingsField>
                    <FormField
                        id="smbHost"
                        label="Host / IP del NAS"
                        required={isRequired}
                        error={errors.smbHost}
                        className="contents"
                        labelSize="sm"
                        groupControlAndError
                    >
                        <Input
                            {...fieldProps("smbHost", { error: errors.smbHost, required: isRequired })}
                            placeholder="es: 192.168.1.10"
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbHost}
                            onChange={(event) => changeFormValues({ smbHost: event.target.value })}
                        />
                    </FormField>
                </SettingsField>

                <SettingsField>
                    <FormField
                        id="smbShare"
                        label="Nome condivisione"
                        required={isRequired}
                        error={errors.smbShare}
                        className="contents"
                        labelSize="sm"
                        groupControlAndError
                    >
                        <Input
                            {...fieldProps("smbShare", { error: errors.smbShare, required: isRequired })}
                            placeholder="es: backup"
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbShare}
                            onChange={(event) => changeFormValues({ smbShare: event.target.value })}
                        />
                    </FormField>
                </SettingsField>
            </SettingsFieldRow>

            <SettingsFieldRow>
                <SettingsField>
                    <FormField id="smbPath" label="Sottocartella (opzionale)" className="contents" labelSize="sm">
                        <Input
                            id="smbPath"
                            placeholder="es: easylab-web"
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbPath}
                            onChange={(event) => changeFormValues({ smbPath: event.target.value })}
                        />
                    </FormField>
                </SettingsField>

                <SettingsField>
                    <FormField
                        id="smbPort"
                        label="Porta"
                        error={errors.smbPort}
                        className="contents"
                        labelSize="sm"
                        groupControlAndError
                    >
                        <Input
                            {...fieldProps("smbPort", { error: errors.smbPort })}
                            type="number"
                            min={1}
                            max={65535}
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbPort}
                            onChange={(event) => changeFormValues({ smbPort: Number(event.target.value) })}
                        />
                    </FormField>
                </SettingsField>
            </SettingsFieldRow>

            <SettingsFieldRow>
                <SettingsField>
                    <FormField id="smbDomain" label="Dominio/Workgroup (opzionale)" className="contents" labelSize="sm">
                        <Input
                            id="smbDomain"
                            placeholder="es: WORKGROUP"
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbDomain}
                            onChange={(event) => changeFormValues({ smbDomain: event.target.value })}
                        />
                    </FormField>
                </SettingsField>

                <SettingsField>
                    <FormField
                        id="smbUsername"
                        label="Utente"
                        required={isRequired}
                        error={errors.smbUsername}
                        className="contents"
                        labelSize="sm"
                        groupControlAndError
                    >
                        <Input
                            {...fieldProps("smbUsername", { error: errors.smbUsername, required: isRequired })}
                            disabled={!formValues.smbEnabled}
                            value={formValues.smbUsername}
                            onChange={(event) => changeFormValues({ smbUsername: event.target.value })}
                        />
                    </FormField>
                </SettingsField>
            </SettingsFieldRow>

            <FormField
                id="smbPassword"
                label="Password"
                required={isPasswordRequired}
                error={errors.smbPassword}
                className="gap-2"
                labelSize="sm"
                groupControlAndError
                description="La password viene salvata cifrata. Lasciala vuota al salvataggio per mantenere quella già impostata."
            >
                <Input
                    {...fieldProps("smbPassword", { error: errors.smbPassword, required: isPasswordRequired })}
                    type="password"
                    autoComplete="new-password"
                    placeholder={smbPasswordSet ? "•••• (invariata, lascia vuoto)" : ""}
                    disabled={!formValues.smbEnabled}
                    value={formValues.smbPassword ?? ""}
                    onChange={(event) => changeFormValues({ smbPassword: event.target.value })}
                />
            </FormField>

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
