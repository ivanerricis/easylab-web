import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import DetailItem, { DetailGrid } from "@/components/detail-item";
import {
    SettingsCard,
    SettingsErrorNote,
    SettingsLoadingBox,
    SettingsTile,
    SettingsTileGrid,
} from "@/components/settings/settingsUi";
import { formatDateTime, formatFileSize } from "@/lib/utils";
import type { BackupPanel } from "./useBackupPanel";

const BackupStatusCard = ({ panel }: { panel: BackupPanel }) => (
    <SettingsCard
        title="Stato backup"
        action={
            <Button
                type="button"
                disabled={panel.isRunningBackup || panel.isSaving || panel.isLoading}
                onClick={() => void panel.handleRunBackup()}
            >
                <Play className="size-4" />
                {panel.isRunningBackup ? "Dump in corso..." : "Esegui dump adesso"}
            </Button>
        }
    >
        {panel.isLoading ? (
            <SettingsLoadingBox />
        ) : (
            <>
                <SettingsTileGrid>
                    <SettingsTile
                        label="Ultimo backup"
                        value={formatDateTime(panel.lastRunAt)}
                        status={panel.lastRunStatus}
                    />
                    <SettingsTile
                        label="Prossima esecuzione"
                        value={panel.nextRunAt ? formatDateTime(panel.nextRunAt) : "Automazione disattivata"}
                    />
                    <SettingsTile
                        label="Ultima copia su NAS"
                        value={formatDateTime(panel.smbLastRunAt)}
                        status={panel.smbLastStatus}
                    />
                    <SettingsTile
                        label="Dump sul server"
                        value={
                            panel.dumpFiles.length === 0
                                ? "Nessuno"
                                : `${panel.dumpFiles.length} — ${formatFileSize(panel.totalDumpsSize)}`
                        }
                    />
                </SettingsTileGrid>

                {panel.lastDumpPath ? (
                    <DetailGrid layout="rows">
                        <DetailItem
                            label="Percorso ultimo dump"
                            value={<span className="font-mono break-all">{panel.lastDumpPath}</span>}
                            longText
                        />
                    </DetailGrid>
                ) : null}

                {panel.lastError ? <SettingsErrorNote label="Ultimo errore backup" message={panel.lastError} /> : null}
                {panel.smbLastError ? (
                    <SettingsErrorNote label="Ultimo errore NAS" message={panel.smbLastError} />
                ) : null}
            </>
        )}
    </SettingsCard>
);

export default BackupStatusCard;
