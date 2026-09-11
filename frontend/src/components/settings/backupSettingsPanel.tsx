import { SettingsSection } from "@/components/settings/settingsUi";
import BackupConfigurationCard from "./backup/backupConfigurationCard";
import BackupDumpsCard from "./backup/backupDumpsCard";
import BackupKeyCard from "./backup/backupKeyCard";
import BackupRestoreCard from "./backup/backupRestoreCard";
import BackupRestoreDialog from "./backup/backupRestoreDialog";
import BackupStatusCard from "./backup/backupStatusCard";
import { useBackupPanel } from "./backup/useBackupPanel";

/**
 * Composizione delle schede del pannello backup. Stato e azioni vivono in
 * `useBackupPanel`; ogni scheda riceve l'oggetto restituito dall'hook come unica prop,
 * perché condividono lo stesso stato e enumerarne i campi uno per uno nelle firme non
 * aggiungerebbe informazione.
 */
const BackupSettingsPanel = () => {
    const panel = useBackupPanel();

    return (
        <SettingsSection>
            <BackupStatusCard panel={panel} />
            <BackupConfigurationCard panel={panel} />
            <BackupKeyCard panel={panel} />
            <BackupDumpsCard panel={panel} />
            <BackupRestoreCard panel={panel} />
            <BackupRestoreDialog panel={panel} />
        </SettingsSection>
    );
};

export default BackupSettingsPanel;
