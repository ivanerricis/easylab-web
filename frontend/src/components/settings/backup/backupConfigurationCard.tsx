import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsActions, SettingsCard, SettingsLoadingBox } from "@/components/settings/settingsUi";
import BackupScheduleFields from "./backupScheduleFields";
import BackupSmbFields from "./backupSmbFields";
import type { BackupPanel } from "./useBackupPanel";

const BackupConfigurationCard = ({ panel }: { panel: BackupPanel }) => (
    <SettingsCard
        title="Configurazione"
        description="Pianificazione del dump automatico e copia su condivisione di rete. Le due sezioni si salvano insieme con il pulsante in fondo."
        contentClassName="@container"
    >
        {panel.isLoading ? (
            <SettingsLoadingBox />
        ) : (
            <>
                {/* Affiancati in base alla larghezza della card, non dello schermo, e solo da
                    1024px in su, come i gruppi di Email: ognuno divide a sua volta i campi in due
                    colonne, e con `xl` a 1440px (barra laterale e menu delle impostazioni aperti)
                    i campi del NAS restavano larghi poco più di 160px. */}
                <div className="grid gap-3 @5xl:grid-cols-2">
                    <BackupScheduleFields panel={panel} />
                    <BackupSmbFields panel={panel} />
                </div>

                <SettingsActions>
                    <Button
                        type="button"
                        disabled={panel.isSaving || panel.isLoading || panel.isRunningBackup || !panel.isDirty}
                        onClick={() => void panel.handleSave()}
                    >
                        <Save className="size-4" />
                        {panel.isSaving ? "Salvataggio..." : "Salva"}
                    </Button>
                </SettingsActions>
            </>
        )}
    </SettingsCard>
);

export default BackupConfigurationCard;
