import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { fieldProps } from "@/lib/formField";
import { KeyRound } from "lucide-react";
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
            <FormField id="backupKeyPassword" label="La tua password" required className="pb-2">
                <Input
                    {...fieldProps("backupKeyPassword", { required: true })}
                    type="password"
                    value={panel.backupKeyPassword}
                    disabled={panel.isLoadingBackupKey}
                    onChange={(event) => panel.setBackupKeyPassword(event.target.value)}
                    autoComplete="current-password"
                    autoFocus
                />
            </FormField>
        }
        confirmLabel={panel.isLoadingBackupKey ? "Verifica in corso..." : "Mostra la chiave"}
        confirmIcon={KeyRound}
        cancelLabel="Annulla"
        onCancel={panel.closeBackupKeyDialog}
        onConfirm={() => void panel.handleRevealBackupKey()}
        cancelDisabled={panel.isLoadingBackupKey}
        confirmDisabled={panel.isLoadingBackupKey || panel.backupKeyPassword.length === 0}
        preventOutsideClose={panel.isLoadingBackupKey}
    />
);

export default BackupKeyDialog;
