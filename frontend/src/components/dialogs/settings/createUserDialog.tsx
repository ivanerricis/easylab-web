import { useState } from "react";
import { toast } from "sonner";
import CustomDialog from "@/components/dialogs/customDialog";
import { RequiredMark } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUser, getApiErrorMessage, type CreatedUserResult } from "@/lib/api";
import { UserPlus } from "lucide-react";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (result: CreatedUserResult) => void;
};

const CreateUserDialog = ({ open, onOpenChange, onCreated }: Props) => {
    const [username, setUsername] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setUsername("");
        }
        onOpenChange(nextOpen);
    };

    const handleConfirm = async () => {
        if (isSubmitting) {
            return;
        }

        if (!username.trim()) {
            toast.error("Il nome utente non può essere vuoto");
            return;
        }

        try {
            setIsSubmitting(true);
            const result = await createUser(username.trim());
            handleOpenChange(false);
            onCreated(result);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile creare l'utente"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={handleOpenChange}
            title="Nuovo utente"
            description="La password viene generata automaticamente e mostrata una sola volta dopo la creazione."
            confirmLabel={isSubmitting ? "Creazione..." : "Crea utente"}
            confirmIcon={UserPlus}
            cancelLabel="Annulla"
            onCancel={() => handleOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting}
            confirmDisabled={isSubmitting}
            content={
                <div className="grid gap-2">
                    <Label htmlFor="newUsername">
                        Nome utente
                        <RequiredMark />
                    </Label>
                    <Input
                        id="newUsername"
                        autoFocus
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                    />
                </div>
            }
        />
    );
};

export default CreateUserDialog;
