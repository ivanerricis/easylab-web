import type { EntityColumn } from "@/components/entity-table";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import CustomDialog from "@/components/dialogs/customDialog";
import type { EditInterventionSubmitValues } from "@/components/dialogs/edit/editInterventionDialog";
import type { RowAction } from "@/components/row-actions";
import { usePendingAction } from "@/hooks/usePendingAction";
import { deleteIntervention, getInterventionPrintUrl, sendInterventionEmail, updateIntervention } from "@/lib/api";
import { toInterventionUpdatePayload } from "@/lib/interventionForm";
import { lazyWithPrefetch, useHasBeenOpen } from "@/lib/lazyDialog";
import { openPrintWindow } from "@/lib/utils";
import type { InterventionDto } from "@/types/dtos";
import { Mail, Pencil, Printer, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";

const { Component: EditInterventionDialog, prefetch: prefetchEditInterventionDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/edit/editInterventionDialog")
);

export { prefetchEditInterventionDialog };

/**
 * La colonna dei pulsanti, da aggiungere in coda alle colonne di una tabella di interventi che
 * usa `useInterventionRowActions`: `EntityTable` disegna le azioni solo nella colonna `actions`.
 */
export const interventionActionsColumn: EntityColumn<InterventionDto> = {
    key: "actions",
    header: "Azioni",
    className: "text-right",
    render: () => null,
};

type InterventionRowActionsOptions = {
    /** Dopo una modifica o un'eliminazione riuscita: di norma ricarica la lista (e la scheda). */
    onChanged: () => Promise<unknown> | void;
};

/**
 * Le azioni di riga di un intervento (modifica, stampa, email, eliminazione) con i loro
 * dialoghi, uguali ovunque compaia una lista di interventi: la lista principale, la scheda del
 * contratto e quella del cliente. Prima c'erano solo nella lista principale, e nelle schede per
 * correggere un intervento bisognava prima aprirlo.
 *
 * Restituisce `getRowActions` per `EntityTable` e `dialogs`, da mettere una volta nella
 * pagina. Il dialogo di modifica si scarica solo alla prima apertura (`lazyWithPrefetch`).
 */
export const useInterventionRowActions = ({ onChanged }: InterventionRowActionsOptions) => {
    const [interventionToEdit, setInterventionToEdit] = useState<InterventionDto | null>(null);
    const hasOpenedEditDialog = useHasBeenOpen(interventionToEdit != null);

    const deleteAction = usePendingAction({
        run: (intervention: InterventionDto) => deleteIntervention(intervention.id),
        successMessage: "Intervento eliminato con successo",
        errorMessage: "Impossibile eliminare l'intervento",
        onDone: () => onChanged(),
    });
    // L'avviso di riuscita è il messaggio del server: dice a chi è andata l'email.
    const emailAction = usePendingAction({
        run: (interventionId: number) => sendInterventionEmail(interventionId),
        successMessage: (_, result) => result.message,
        errorMessage: "Impossibile inviare l'email",
    });

    const handleEditIntervention = async (values: EditInterventionSubmitValues) => {
        await updateIntervention(values.interventionId, toInterventionUpdatePayload(values));
        // Niente ritocco della riga in pagina prima di ricaricare: la lista si ricarica subito
        // comunque (la riga può anche uscire dal filtro), e il ritocco copiava sul client regole
        // del server, mostrando per un istante una riga a metà.
        await onChanged();
    };

    const getRowActions = (row: InterventionDto): RowAction[] => [
        {
            key: "edit",
            label: "Modifica",
            ariaLabel: `Modifica intervento ${row.id}`,
            icon: Pencil,
            onSelect: () => setInterventionToEdit(row),
            onPointerEnter: prefetchEditInterventionDialog,
        },
        {
            key: "print",
            label: "Stampa",
            ariaLabel: `Stampa intervento ${row.id}`,
            icon: Printer,
            tone: "print",
            onSelect: () => openPrintWindow(getInterventionPrintUrl(row.id)),
        },
        {
            key: "email",
            label: "Invia email",
            ariaLabel: `Invia email intervento ${row.id}`,
            icon: Mail,
            tone: "email",
            onSelect: () => emailAction.open(row.id),
        },
        {
            key: "delete",
            label: "Elimina",
            ariaLabel: `Elimina intervento ${row.id}`,
            icon: Trash2,
            variant: "destructive",
            onSelect: () => deleteAction.open(row),
        },
    ];

    const dialogs = (
        <>
            {hasOpenedEditDialog ? (
                <Suspense fallback={null}>
                    <EditInterventionDialog
                        open={interventionToEdit != null}
                        interventionId={interventionToEdit?.id ?? null}
                        customerName={interventionToEdit?.customer ?? ""}
                        onOpenChange={(open) => {
                            if (!open) {
                                setInterventionToEdit(null);
                            }
                        }}
                        onSubmit={handleEditIntervention}
                    />
                </Suspense>
            ) : null}

            <ConfirmDeleteDialog
                open={deleteAction.isOpen}
                onOpenChange={deleteAction.onOpenChange}
                title="Elimina intervento"
                description={
                    deleteAction.pending
                        ? `Sei sicuro di voler eliminare l'intervento ID ${deleteAction.pending.id}?`
                        : "Sei sicuro di voler eliminare questo intervento?"
                }
                isDeleting={deleteAction.isRunning}
                onConfirm={deleteAction.confirm}
            />

            <CustomDialog
                open={emailAction.isOpen}
                onOpenChange={emailAction.onOpenChange}
                title="Invia email intervento"
                description={`Sei sicuro di voler inviare l'email per l'intervento ID ${emailAction.pending}?`}
                confirmLabel="Invia"
                // La busta come il pulsante della riga che apre questo dialogo.
                confirmIcon={Mail}
                cancelLabel="Annulla"
                confirmDisabled={emailAction.isRunning}
                onCancel={emailAction.close}
                onConfirm={emailAction.confirm}
            />
        </>
    );

    return { getRowActions, dialogs };
};
