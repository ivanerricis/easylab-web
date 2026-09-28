import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldProps } from "@/lib/formField";
import { restoreConfirmKeyword, type BackupPanel } from "./useBackupPanel";
import { ArchiveRestore } from "lucide-react";

const BackupRestoreDialog = ({ panel }: { panel: BackupPanel }) => {
    const { pendingRestore } = panel;
    // Password, parola di conferma e chiave si scrivono a mano: un Esc di troppo li butterebbe
    // via senza chiedere. La spunta sullo schema no, si rimette con un clic.
    const isDirty =
        panel.restorePassword !== "" || panel.restoreConfirmText !== "" || panel.restoreBackupKeyInput !== "";

    return (
        <CustomDialog
            open={pendingRestore !== null}
            onOpenChange={(open) => {
                if (!open) {
                    panel.closeRestoreConfirm();
                }
            }}
            isDirty={isDirty}
            title="Conferma ripristino database"
            description={
                pendingRestore?.type === "existing"
                    ? `Stai per sovrascrivere il database con il dump "${pendingRestore.fileName}". L'operazione è irreversibile.`
                    : pendingRestore?.type === "upload"
                      ? `Stai per sovrascrivere il database con il file caricato "${pendingRestore.file.name}". L'operazione è irreversibile.`
                      : ""
            }
            content={
                <div className="grid gap-3 pb-2">
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

                    <FormField id="restorePassword" label="La tua password" required>
                        <Input
                            {...fieldProps("restorePassword", { required: true })}
                            aria-describedby="restorePasswordHint"
                            type="password"
                            value={panel.restorePassword}
                            disabled={panel.isRestoring}
                            onChange={(event) => panel.setRestorePassword(event.target.value)}
                            autoComplete="current-password"
                        />
                        <p id="restorePasswordHint" className="mt-1 text-xs text-muted-foreground">
                            Richiesta di nuovo perché il ripristino sostituisce l&apos;intero database.
                        </p>
                    </FormField>

                    {/* Senza `gap`, come i `FormField` accanto: l'etichetta sta attaccata al campo. */}
                    <div className="grid">
                        {/* Come in `ConfirmDeleteDialog`: `block` perché il `gap` del `Label` flex
                            spezzava la frase attorno alla parola in grassetto, `text-lg` come le
                            altre etichette del dialogo. */}
                        <Label htmlFor="restoreConfirmText" className="block text-lg leading-snug">
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

                    <FormField id="restoreBackupKey" label="Chiave di backup">
                        <Input
                            {...fieldProps("restoreBackupKey")}
                            // Quando serve la chiave lo diceva l'etichetta; ora che l'etichetta è
                            // breve come le altre, la spiegazione sotto va comunque letta col campo.
                            aria-describedby="restoreBackupKeyHint"
                            value={panel.restoreBackupKeyInput}
                            disabled={panel.isRestoring}
                            onChange={(event) => panel.setRestoreBackupKeyInput(event.target.value)}
                            placeholder="Lascia vuoto se ripristini sullo stesso server del backup"
                            autoComplete="off"
                            className="font-mono"
                        />
                        <p id="restoreBackupKeyHint" className="mt-1 text-xs text-muted-foreground">
                            Solo se richiesta: ripristino da un server diverso da quello che ha creato questo backup.
                        </p>
                    </FormField>
                </div>
            }
            confirmLabel={panel.isRestoring ? "Ripristino in corso..." : "Ripristina"}
            confirmIcon={ArchiveRestore}
            cancelLabel="Annulla"
            onCancel={panel.closeRestoreConfirm}
            onConfirm={() => void panel.handleConfirmRestore()}
            cancelDisabled={panel.isRestoring}
            confirmDisabled={
                panel.isRestoring ||
                panel.restoreConfirmText !== restoreConfirmKeyword ||
                panel.restorePassword.length === 0
            }
            preventOutsideClose={panel.isRestoring}
            destructive
        />
    );
};

export default BackupRestoreDialog;
