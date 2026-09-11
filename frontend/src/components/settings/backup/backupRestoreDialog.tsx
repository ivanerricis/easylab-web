import CustomDialog from "@/components/dialogs/customDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { restoreConfirmKeyword, type BackupPanel } from "./useBackupPanel";
import { ArchiveRestore } from "lucide-react";

const BackupRestoreDialog = ({ panel }: { panel: BackupPanel }) => {
    const { pendingRestore } = panel;

    return (
        <CustomDialog
            open={pendingRestore !== null}
            onOpenChange={(open) => {
                if (!open) {
                    panel.closeRestoreConfirm();
                }
            }}
            title="Conferma ripristino database"
            description={
                pendingRestore?.type === "existing"
                    ? `Stai per sovrascrivere il database con il dump "${pendingRestore.fileName}". L'operazione è irreversibile.`
                    : pendingRestore?.type === "upload"
                      ? `Stai per sovrascrivere il database con il file caricato "${pendingRestore.file.name}". L'operazione è irreversibile.`
                      : ""
            }
            content={
                <div className="grid gap-3 py-2">
                    <div className="flex items-start gap-3 rounded-md border border-destructive/20 bg-muted/20 p-3">
                        <Checkbox
                            id="resetSchemaOnRestore"
                            checked={panel.resetSchemaOnRestore}
                            disabled={panel.isRestoring}
                            onCheckedChange={(checked) => panel.setResetSchemaOnRestore(Boolean(checked))}
                        />
                        <Label
                            htmlFor="resetSchemaOnRestore"
                            className="cursor-pointer text-sm leading-snug font-normal"
                        >
                            Svuota lo schema prima del ripristino (consigliato se il dump contiene l&apos;intero
                            database)
                        </Label>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="restoreConfirmText">
                            Digita <span className="font-semibold">{restoreConfirmKeyword}</span> per confermare
                        </Label>
                        <Input
                            id="restoreConfirmText"
                            value={panel.restoreConfirmText}
                            disabled={panel.isRestoring}
                            onChange={(event) => panel.setRestoreConfirmText(event.target.value)}
                            autoComplete="off"
                        />
                    </div>
                </div>
            }
            confirmLabel={panel.isRestoring ? "Ripristino in corso..." : "Ripristina"}
            confirmIcon={ArchiveRestore}
            cancelLabel="Annulla"
            onCancel={panel.closeRestoreConfirm}
            onConfirm={() => void panel.handleConfirmRestore()}
            cancelDisabled={panel.isRestoring}
            confirmDisabled={panel.isRestoring || panel.restoreConfirmText !== restoreConfirmKeyword}
            preventOutsideClose={panel.isRestoring}
            destructive
        />
    );
};

export default BackupRestoreDialog;
