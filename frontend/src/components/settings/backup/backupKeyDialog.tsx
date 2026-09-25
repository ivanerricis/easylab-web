import CustomDialog from "@/components/dialogs/customDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BackupPanel } from "./useBackupPanel";

const BackupKeyDialog = ({ panel }: { panel: BackupPanel }) => (
    <CustomDialog
        open={panel.isBackupKeyDialogOpen}
        onOpenChange={(open) => {
            if (!open) {
                panel.closeBackupKeyDialog();
            }
        }}
        title="Conferma password"
        description="La chiave rende leggibile qualsiasi backup rubato dal NAS: confermala di nuovo con la tua password."
        content={
            <div className="grid gap-2 pb-2">
                <Label htmlFor="backupKeyPassword">La tua password</Label>
                <Input
                    id="backupKeyPassword"
                    type="password"
                    value={panel.backupKeyPassword}
                    disabled={panel.isLoadingBackupKey}
                    onChange={(event) => panel.setBackupKeyPassword(event.target.value)}
                    autoComplete="current-password"
                    autoFocus
                />
            </div>
        }
        confirmLabel={panel.isLoadingBackupKey ? "Verifica in corso..." : "Mostra la chiave"}
        cancelLabel="Annulla"
        onCancel={panel.closeBackupKeyDialog}
        onConfirm={() => void panel.handleRevealBackupKey()}
        cancelDisabled={panel.isLoadingBackupKey}
        confirmDisabled={panel.isLoadingBackupKey || panel.backupKeyPassword.length === 0}
        preventOutsideClose={panel.isLoadingBackupKey}
    />
);

export default BackupKeyDialog;
