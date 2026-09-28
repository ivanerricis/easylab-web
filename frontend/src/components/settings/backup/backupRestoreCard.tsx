import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import SettingsFileInput from "@/components/settings/settingsFileInput";
import {
    SettingsCard,
    SettingsErrorNote,
    SettingsGroup,
    SettingsLoadingBox,
    SettingsStatusBadge,
    SettingsWarningNote,
} from "@/components/settings/settingsUi";
import DetailItem, { DetailGrid } from "@/components/detail-item";
import { formatDateTime, formatFileSize } from "@/lib/utils";
import type { BackupPanel } from "./useBackupPanel";

const BackupRestoreCard = ({ panel }: { panel: BackupPanel }) => (
    <SettingsCard
        title="Ripristino da file esterno"
        keepDescriptionOnMobile
        description="Carica un dump che non si trova sul server per sovrascrivere i dati attuali. Operazione irreversibile: valuta di eseguire prima un dump del database corrente."
        destructive
    >
        {panel.isLoading ? (
            <SettingsLoadingBox destructive />
        ) : (
            <>
                <SettingsGroup destructive>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <SettingsFileInput
                            id="restoreUpload"
                            label="File .tar.gz o .sql"
                            accept=".sql,.gz,.tar.gz,text/plain,application/sql,application/gzip"
                            disabled={panel.isRestoring}
                            onChange={panel.handleRestoreFileSelected}
                            status={
                                panel.restoreUploadFile
                                    ? `${panel.restoreUploadFile.name} (${formatFileSize(panel.restoreUploadFile.size)})`
                                    : undefined
                            }
                        />
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={!panel.restoreUploadFile || panel.isRestoring}
                            onClick={() =>
                                panel.restoreUploadFile &&
                                panel.openRestoreConfirm({
                                    type: "upload",
                                    file: panel.restoreUploadFile,
                                })
                            }
                        >
                            <RotateCcw className="size-4" />
                            Ripristina da questo file
                        </Button>
                    </div>
                </SettingsGroup>

                {panel.secretsToReconfigure.length > 0 ? (
                    <SettingsWarningNote title="Password da reinserire dopo il ripristino">
                        <p className="text-muted-foreground">
                            Le password sono cifrate con una chiave che resta sul server e non viene inclusa nei backup.
                            Ripristinando su un&apos;altra macchina non sono più leggibili e vanno riscritte:
                        </p>
                        <ul className="list-disc pl-5">
                            {panel.secretsToReconfigure.map((secret) => (
                                <li key={secret}>{secret}</li>
                            ))}
                        </ul>
                    </SettingsWarningNote>
                ) : null}

                <SettingsGroup destructive>
                    <DetailGrid layout="rows">
                        <DetailItem
                            label="Ultimo ripristino"
                            value={
                                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                    {formatDateTime(panel.lastRestoreAt)}
                                    <SettingsStatusBadge status={panel.lastRestoreStatus} />
                                </span>
                            }
                        />
                        <DetailItem
                            label="Dump utilizzato"
                            value={<span className="font-mono">{panel.lastRestoreFileName ?? "-"}</span>}
                        />
                    </DetailGrid>
                    {panel.lastRestoreError ? (
                        <SettingsErrorNote label="Ultimo errore" message={panel.lastRestoreError} />
                    ) : null}
                </SettingsGroup>
            </>
        )}
    </SettingsCard>
);

export default BackupRestoreCard;
