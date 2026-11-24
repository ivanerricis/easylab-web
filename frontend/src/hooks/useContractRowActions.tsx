import type { ContractSubmitValues } from "@/components/dialogs/create/createContractDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import type { RowAction } from "@/components/row-actions";
import { usePendingAction } from "@/hooks/usePendingAction";
import { deleteContract, getContractPrintUrl, updateContract } from "@/lib/api";
import { toContractUpdatePayload } from "@/lib/contractForm";
import { contractPrintName } from "@/lib/contracts";
import { lazyWithPrefetch } from "@/lib/lazyDialog";
import { openPrintWindow } from "@/lib/utils";
import type { ContractDto } from "@/types/dtos";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";

const { Component: EditContractDialog, prefetch: prefetchEditContractDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/create/createContractDialog")
);

export { prefetchEditContractDialog };

type ContractRowActionsOptions = {
    /** Dopo una modifica o un'eliminazione riuscita: di norma ricarica la lista (e la scheda). */
    onChanged: () => Promise<unknown> | void;
};

/**
 * Le azioni di riga di un contratto (modifica, stampa, eliminazione) con i loro dialoghi, uguali
 * ovunque compaia una lista di contratti: la lista principale e le schede di cliente e fornitore.
 * Prima nelle schede c'era solo la stampa, e per correggere un contratto bisognava aprirlo.
 *
 * Restituisce `getRowActions` per `EntityTable` e `dialogs`, da mettere una volta nella
 * pagina. Il dialogo di modifica si scarica solo alla prima apertura (`lazyWithPrefetch`).
 */
export const useContractRowActions = ({ onChanged }: ContractRowActionsOptions) => {
    const [contractToEdit, setContractToEdit] = useState<ContractDto | null>(null);

    const deleteAction = usePendingAction({
        run: (contract: ContractDto) => deleteContract(contract.id),
        successMessage: "Contratto eliminato con successo",
        errorMessage: "Impossibile eliminare il contratto",
        onDone: () => onChanged(),
    });

    const handleEditContract = async (values: ContractSubmitValues) => {
        if (!contractToEdit) {
            return;
        }

        await updateContract(contractToEdit.id, toContractUpdatePayload(values));
        await onChanged();
    };

    const getRowActions = (row: ContractDto): RowAction[] => [
        {
            key: "edit",
            label: "Modifica",
            ariaLabel: `Modifica contratto ${row.id}`,
            icon: Pencil,
            onSelect: () => setContractToEdit(row),
            onPointerEnter: prefetchEditContractDialog,
        },
        {
            key: "print",
            label: "Stampa",
            ariaLabel: `Stampa ${contractPrintName(row.effectiveStatus)} ${row.id}`,
            icon: Printer,
            tone: "print",
            onSelect: () => openPrintWindow(getContractPrintUrl(row.id)),
        },
        {
            key: "delete",
            label: "Elimina",
            ariaLabel: `Elimina contratto ${row.id}`,
            icon: Trash2,
            variant: "destructive",
            onSelect: () => deleteAction.open(row),
        },
    ];

    const dialogs = (
        <>
            {contractToEdit ? (
                <Suspense fallback={null}>
                    <EditContractDialog
                        open
                        onOpenChange={(open) => {
                            if (!open) {
                                setContractToEdit(null);
                            }
                        }}
                        mode="edit"
                        initialValues={contractToEdit}
                        onSubmit={handleEditContract}
                    />
                </Suspense>
            ) : null}

            <ConfirmDeleteDialog
                open={deleteAction.isOpen}
                onOpenChange={deleteAction.onOpenChange}
                title="Elimina contratto"
                description={
                    deleteAction.pending
                        ? `Sei sicuro di voler eliminare il contratto ID ${deleteAction.pending.id} di ${deleteAction.pending.customerName}?`
                        : "Sei sicuro di voler eliminare questo contratto?"
                }
                isDeleting={deleteAction.isRunning}
                onConfirm={deleteAction.confirm}
            />
        </>
    );

    return { getRowActions, dialogs };
};
