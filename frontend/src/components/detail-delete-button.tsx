import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getApiErrorMessage } from "@/lib/api";
import { Trash2 } from "lucide-react";
import { settleDialogHistory } from "@/hooks/useDialogHistoryEntry";
import { useGoBack } from "@/hooks/useGoBack";
import { useState } from "react";
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
    /**
     * L'elenco dove andare dopo l'eliminazione se non c'è una pagina precedente in questa
     * applicazione (scheda aperta da un link incollato o in un'altra scheda del browser).
     */
    redirectTo: string;
};

/**
 * "Elimina" nell'intestazione di una scheda (report, intervento, cliente). Prima si poteva
 * eliminare solo dalle righe degli elenchi: dalla scheda bisognava tornare indietro e ritrovare
 * la riga. Chiede la stessa conferma degli elenchi (digitare ELIMINA) e poi torna indietro,
 * come la freccia dell'intestazione (`useGoBack`).
 *
 * Prima andava a `redirectTo` sostituendo la voce della cronologia: si tornava sì all'elenco, ma
 * a uno nuovo, senza la ricerca, i filtri e la pagina da cui si era aperta la scheda (stanno
 * nell'indirizzo dell'elenco: vedi `useListUrlState`), e chi era arrivato da un'altra scheda
 * (il report aperto dal cliente) finiva su un elenco che non aveva mai visto. Tornando indietro
 * nella cronologia l'elenco riappare com'era, e la riga eliminata non c'è più perché si ricarica
 * al montaggio. La scheda eliminata resta solo "avanti", dove al massimo mostra "non trovato".
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
    const goBack = useGoBack(redirectTo);
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
            // Il dialogo aperto tiene una voce sua in cima alla cronologia (Indietro lo chiude:
            // vedi `useDialogHistoryEntry`). Senza aspettare che la chiusura la consumi, il
            // passo indietro di `goBack` toglierebbe quella voce invece della scheda, e si
            // resterebbe sulla scheda appena eliminata.
            await settleDialogHistory();
            goBack();
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
