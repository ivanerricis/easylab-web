import CreateCustomerDeviceDialog, {
    type CustomerDeviceSubmitValues,
} from "@/components/dialogs/create/createCustomerDeviceDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import type { RowAction } from "@/components/row-actions";
import { usePendingAction } from "@/hooks/usePendingAction";
import { deleteCustomerDevice, updateCustomerDevice } from "@/lib/api";
import type { CustomerDeviceDto } from "@/types/dtos";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

type CustomerDeviceRowActionsOptions = {
    /** Il nome del cliente, per la descrizione dei dialoghi. */
    customerName: string;
    /** Dopo una modifica o un'eliminazione riuscita: di norma ricarica la lista. */
    onChanged: () => Promise<unknown> | void;
};

/**
 * Le azioni di riga di un dispositivo del cliente (modifica, eliminazione) con i loro dialoghi, nella
 * stessa forma degli altri `use*RowActions`: `getRowActions` per `EntityTable` (pulsanti e menu col
 * tasto destro) e `dialogs`, da mettere una volta nella pagina. L'eliminazione chiede di digitare
 * ELIMINA; se il dispositivo è ancora in un contratto il server lo rifiuta e l'avviso lo dice.
 */
export const useCustomerDeviceRowActions = ({ customerName, onChanged }: CustomerDeviceRowActionsOptions) => {
    const [deviceToEdit, setDeviceToEdit] = useState<CustomerDeviceDto | null>(null);

    const deleteAction = usePendingAction({
        run: (device: CustomerDeviceDto) => deleteCustomerDevice(device.id),
        successMessage: "Dispositivo eliminato con successo",
        errorMessage: "Impossibile eliminare il dispositivo",
        onDone: () => onChanged(),
    });

    const handleEdit = async (values: CustomerDeviceSubmitValues) => {
        if (!deviceToEdit) {
            return;
        }

        await updateCustomerDevice(deviceToEdit.id, values);
        await onChanged();
    };

    const getRowActions = (row: CustomerDeviceDto): RowAction[] => [
        {
            key: "edit",
            label: "Modifica",
            ariaLabel: `Modifica dispositivo ${row.name}`,
            icon: Pencil,
            onSelect: () => setDeviceToEdit(row),
        },
        {
            key: "delete",
            label: "Elimina",
            ariaLabel: `Elimina dispositivo ${row.name}`,
            icon: Trash2,
            variant: "destructive",
            onSelect: () => deleteAction.open(row),
        },
    ];

    const dialogs = (
        <>
            {deviceToEdit ? (
                <CreateCustomerDeviceDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) {
                            setDeviceToEdit(null);
                        }
                    }}
                    mode="edit"
                    initialValues={deviceToEdit}
                    customerName={customerName}
                    onSubmit={handleEdit}
                />
            ) : null}

            <ConfirmDeleteDialog
                open={deleteAction.isOpen}
                onOpenChange={deleteAction.onOpenChange}
                title="Elimina dispositivo"
                description={
                    deleteAction.pending
                        ? `Sei sicuro di voler eliminare il dispositivo ${deleteAction.pending.name} (S/N ${deleteAction.pending.serialNumber})?`
                        : "Sei sicuro di voler eliminare questo dispositivo?"
                }
                isDeleting={deleteAction.isRunning}
                onConfirm={deleteAction.confirm}
            />
        </>
    );

    return { getRowActions, openEdit: setDeviceToEdit, dialogs };
};
