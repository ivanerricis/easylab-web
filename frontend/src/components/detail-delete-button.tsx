import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getApiErrorMessage } from "@/lib/api";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type Props = {
    /** Etichetta accessibile e testo del suggerimento, es. "Elimina report". */
    label: string;
    /** Titolo e testo del dialogo di conferma. */
    title: string;
    description: string;
    onDelete: () => Promise<unknown>;
    successMessage: string;
    errorMessage: string;
    /** Dove andare dopo l'eliminazione: la scheda non ha più niente da mostrare. */
    redirectTo: string;
};

/**
 * "Elimina" nell'intestazione di una scheda (report, intervento, cliente). Prima si poteva
 * eliminare solo dalle righe degli elenchi: dalla scheda bisognava tornare indietro e ritrovare
 * la riga. Chiede la stessa conferma degli elenchi (digitare ELIMINA) e poi torna all'elenco,
 * sostituendo la voce della cronologia: "indietro" non deve riaprire una scheda che non esiste
 * più.
 */
const DetailDeleteButton = ({
    label,
    title,
    description,
    onDelete,
    successMessage,
    errorMessage,
    redirectTo,
}: Props) => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleConfirm = async () => {
        if (isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await onDelete();
            toast.success(successMessage);
            setIsOpen(false);
            navigate(redirectTo, { replace: true });
        } catch (error) {
            toast.error(getApiErrorMessage(error, errorMessage));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="destructive" size="lg" onClick={() => setIsOpen(true)} aria-label={label}>
                        <Trash2 className="size-5" />
                        {/* 14px come le altre azioni dell'intestazione (`DetailHeaderAction`), non più 18px. */}
                        <span className="hidden lg:inline">Elimina</span>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>

            <ConfirmDeleteDialog
                open={isOpen}
                onOpenChange={setIsOpen}
                title={title}
                description={description}
                isDeleting={isDeleting}
                onConfirm={handleConfirm}
            />
        </>
    );
};

export default DetailDeleteButton;
