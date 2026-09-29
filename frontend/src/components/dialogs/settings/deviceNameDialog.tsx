import { useState } from "react";
import { Save } from "lucide-react";
import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { fieldProps } from "@/lib/formField";

/** Lo stesso tetto del server (`deviceNameBodySchema`). */
export const deviceNameMaxLength = 60;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Il nome attuale, se c'è: il campo parte da lì e lasciarlo vuoto lo toglie. */
    currentName: string | null;
    onSave: (name: string | null) => Promise<void>;
};

/**
 * Dare un nome al dispositivo in uso ("Portatile del banco"), per riconoscerlo nell'elenco
 * delle sessioni quando ce ne sono due uguali. Chi apre il dialogo cambia il nome del proprio
 * dispositivo e di nessun altro: vedi `setOwnDeviceName`.
 *
 * Il campo prende il nome salvato solo alla creazione: chi lo usa gli dà una `key` diversa per
 * ogni sessione, così a ogni apertura riparte da lì e non da una modifica lasciata a metà.
 */
const DeviceNameDialog = ({ open, onOpenChange, currentName, onSave }: Props) => {
    const [name, setName] = useState(currentName ?? "");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await onSave(name.trim() || null);
            onOpenChange(false);
        } catch {
            // Chi ha passato `onSave` mostra l'errore in un toast e rilancia: il dialogo
            // resta aperto per riprovare.
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={onOpenChange}
            isDirty={name.trim() !== (currentName ?? "")}
            title="Nome del dispositivo"
            description="Ti aiuta a riconoscere questo dispositivo nell'elenco delle sessioni. Lascia vuoto per toglierlo."
            confirmLabel={isSaving ? "Salvataggio..." : "Salva"}
            confirmIcon={Save}
            confirmDisabled={isSaving}
            cancelDisabled={isSaving}
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleSave()}
            content={
                <div className="grid gap-3 pb-2">
                    <FormField id="deviceName" label="Nome">
                        <Input
                            {...fieldProps("deviceName", {})}
                            maxLength={deviceNameMaxLength}
                            placeholder="Portatile del banco"
                            autoComplete="off"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </FormField>
                </div>
            }
        />
    );
};

export default DeviceNameDialog;
