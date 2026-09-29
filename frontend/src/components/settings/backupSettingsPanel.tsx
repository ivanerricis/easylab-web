import { useEffect } from "react";
import { SettingsSection } from "@/components/settings/settingsUi";
import BackupConfigurationCard from "./backup/backupConfigurationCard";
import BackupDumpsCard from "./backup/backupDumpsCard";
import BackupKeyCard from "./backup/backupKeyCard";
import BackupKeyDialog from "./backup/backupKeyDialog";
import BackupRestoreCard from "./backup/backupRestoreCard";
import BackupRestoreDialog from "./backup/backupRestoreDialog";
import BackupStatusCard from "./backup/backupStatusCard";
import { useBackupPanel } from "./backup/useBackupPanel";

type Props = {
    /** Chiamata a ogni cambio di "ci sono modifiche non salvate", e con `false` allo smontaggio. */
    onDirtyChange?: (isDirty: boolean) => void;
};

/**
 * Composizione delle schede del pannello backup. Stato e azioni vivono in
 * `useBackupPanel`; ogni scheda riceve l'oggetto restituito dall'hook come unica prop,
 * perché condividono lo stesso stato e enumerarne i campi uno per uno nelle firme non
 * aggiungerebbe informazione.
 */
const BackupSettingsPanel = ({ onDirtyChange }: Props) => {
    const panel = useBackupPanel();
    const { isDirty } = panel;

    // La pagina Impostazioni chiede conferma prima di lasciare la sezione con modifiche non
    // salvate: le serve sapere quando il modulo è diverso da quanto salvato. Allo smontaggio
    // (sezione cambiata) non ci sono più modifiche in sospeso.
    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

    return (
        <SettingsSection>
            <BackupStatusCard panel={panel} />
            <BackupConfigurationCard panel={panel} />
            <BackupKeyCard panel={panel} />
            <BackupDumpsCard panel={panel} />
            <BackupRestoreCard panel={panel} />
            <BackupRestoreDialog panel={panel} />
            <BackupKeyDialog panel={panel} />
        </SettingsSection>
    );
};

export default BackupSettingsPanel;
