import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settingsUi";
import CopyableValue from "@/components/dialogs/settings/copyableValue";
import type { BackupPanel } from "./useBackupPanel";

/**
 * L'archivio di backup (locale o sul NAS) è cifrato con questa chiave, generata da sola e
 * mai inclusa nell'archivio stesso. Va mostrata solo su richiesta, non caricata insieme al
 * resto del pannello: è l'unico dato qui che permette di leggere il contenuto di un backup,
 * quindi meglio non tenerla in memoria finché non serve davvero copiarla.
 */
const BackupKeyCard = ({ panel }: { panel: BackupPanel }) => (
    <SettingsCard
        title="Chiave di cifratura dei backup"
        description="Ogni backup viene cifrato con questa chiave, così un archivio rubato dal NAS resta illeggibile. Conservala altrove (es. un password manager): se il server viene perso insieme al suo disco, è l'unico modo per ripristinare un backup su un server nuovo."
    >
        {panel.backupKey ? (
            <CopyableValue
                id="backupKey"
                label="Chiave di backup"
                value={panel.backupKey}
                copiedMessage="Chiave di backup copiata"
                errorMessage="Impossibile copiare la chiave: selezionala e copiala a mano"
            />
        ) : (
            <div>
                <Button
                    type="button"
                    variant="outline"
                    disabled={panel.isLoadingBackupKey}
                    onClick={() => void panel.handleRevealBackupKey()}
                >
                    {panel.isLoadingBackupKey ? "Caricamento..." : "Mostra ed esporta la chiave"}
                </Button>
            </div>
        )}
    </SettingsCard>
);

export default BackupKeyCard;
