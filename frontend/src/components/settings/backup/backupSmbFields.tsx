import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsActions, SettingsField, SettingsFieldRow, SettingsGroup } from "@/components/settings/settingsUi";
import type { BackupPanel } from "./useBackupPanel";

const BackupSmbFields = ({ panel }: { panel: BackupPanel }) => {
    const { formValues, setFormValues, smbPasswordSet, isTestingSmb } = panel;

    return (
        <SettingsGroup title="Destinazione di rete (NAS)">
            {/* `items-start` e `leading-snug`: vedi le caselle di `BackupScheduleFields`. */}
            <div className="flex items-start gap-3">
                <Checkbox
                    id="smbEnabled"
                    checked={formValues.smbEnabled}
                    onCheckedChange={(checked) =>
                        setFormValues((prev) => ({
                            ...prev,
                            smbEnabled: Boolean(checked),
                        }))
                    }
                />
                <Label htmlFor="smbEnabled" className="cursor-pointer leading-snug">
                    Copia ogni backup su una condivisione SMB/CIFS
                </Label>
            </div>

            <SettingsFieldRow>
                <SettingsField>
                    <Label htmlFor="smbHost">Host / IP del NAS</Label>
                    <Input
                        id="smbHost"
                        placeholder="es: 192.168.1.10"
                        disabled={!formValues.smbEnabled}
                        value={formValues.smbHost}
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                smbHost: event.target.value,
                            }))
                        }
                    />
                </SettingsField>

                <SettingsField>
                    <Label htmlFor="smbShare">Nome condivisione</Label>
                    <Input
                        id="smbShare"
                        placeholder="es: backup"
                        disabled={!formValues.smbEnabled}
                        value={formValues.smbShare}
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                smbShare: event.target.value,
                            }))
                        }
                    />
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
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                smbPath: event.target.value,
                            }))
                        }
                    />
                </SettingsField>

                <SettingsField>
                    <Label htmlFor="smbPort">Porta</Label>
                    <Input
                        id="smbPort"
                        type="number"
                        min={1}
                        max={65535}
                        disabled={!formValues.smbEnabled}
                        value={formValues.smbPort}
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                smbPort: Number(event.target.value),
                            }))
                        }
                    />
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
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                smbDomain: event.target.value,
                            }))
                        }
                    />
                </SettingsField>

                <SettingsField>
                    <Label htmlFor="smbUsername">Utente</Label>
                    <Input
                        id="smbUsername"
                        disabled={!formValues.smbEnabled}
                        value={formValues.smbUsername}
                        onChange={(event) =>
                            setFormValues((prev) => ({
                                ...prev,
                                smbUsername: event.target.value,
                            }))
                        }
                    />
                </SettingsField>
            </SettingsFieldRow>

            <div className="grid gap-2">
                <Label htmlFor="smbPassword">Password</Label>
                <Input
                    id="smbPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder={smbPasswordSet ? "•••• (invariata, lascia vuoto)" : ""}
                    disabled={!formValues.smbEnabled}
                    value={formValues.smbPassword ?? ""}
                    onChange={(event) =>
                        setFormValues((prev) => ({
                            ...prev,
                            smbPassword: event.target.value,
                        }))
                    }
                />
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
                    {isTestingSmb ? "Test in corso..." : "Testa connessione"}
                </Button>
            </SettingsActions>
        </SettingsGroup>
    );
};

export default BackupSmbFields;
