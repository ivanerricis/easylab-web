import type { ContractSubmitValues } from "@/components/dialogs/create/createContractDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import TableActionButton from "@/components/table-action-button";
import { usePendingAction } from "@/hooks/usePendingAction";
import { deleteContract, getContractPrintUrl, updateContract } from "@/lib/api";
import { toContractUpdatePayload } from "@/lib/contractForm";
import { contractPrintName } from "@/lib/contracts";
import { lazyWithPrefetch } from "@/lib/lazyDialog";
import { openPrintWindow } from "@/lib/utils";
import type { ContractDto } from "@/types/dtos";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";

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
 * Restituisce `renderRowActions` per `EntityTable` e `dialogs`, da mettere una volta nella
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

    const renderRowActions = (row: ContractDto): ReactNode => (
        <>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-muted hover:bg-primary/20"
                onClick={() => setContractToEdit(row)}
                onPointerEnter={prefetchEditContractDialog}
                aria-label={`Modifica contratto ${row.id}`}
            >
                <Pencil className="size-5 text-muted-foreground transition-colors group-hover/button:text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-muted hover:bg-action-print/20"
                onClick={() => openPrintWindow(getContractPrintUrl(row.id))}
                aria-label={`Stampa ${contractPrintName(row.effectiveStatus)} ${row.id}`}
            >
                <Printer className="size-5 text-muted-foreground transition-colors group-hover/button:text-action-print" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => deleteAction.open(row)}
                aria-label={`Elimina contratto ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

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

    return { renderRowActions, dialogs };
};
