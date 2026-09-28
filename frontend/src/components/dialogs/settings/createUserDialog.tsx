import { useState } from "react";
import { toast } from "sonner";
import CustomDialog from "@/components/dialogs/customDialog";
import FormField from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { createUser, getApiErrorMessage, type CreatedUserResult } from "@/lib/api";
import { fieldProps } from "@/lib/formField";
import { UserPlus } from "lucide-react";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (result: CreatedUserResult) => void;
};

const CreateUserDialog = ({ open, onOpenChange, onCreated }: Props) => {
    const [username, setUsername] = useState("");
    const [usernameError, setUsernameError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setUsername("");
            setUsernameError(undefined);
        }
        onOpenChange(nextOpen);
    };

    const handleConfirm = async () => {
        if (isSubmitting) {
            return;
        }

        if (!username.trim()) {
            setUsernameError("Il nome utente non può essere vuoto");
            document.getElementById("newUsername")?.focus();
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
            isDirty={username !== ""}
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
                <FormField id="newUsername" label="Nome utente" required error={usernameError}>
                    <Input
                        {...fieldProps("newUsername", { error: usernameError, required: true })}
                        autoFocus
                        value={username}
                        onChange={(event) => {
                            setUsername(event.target.value);
                            setUsernameError(undefined);
                        }}
                    />
                </FormField>
            }
        />
    );
};

export default CreateUserDialog;
