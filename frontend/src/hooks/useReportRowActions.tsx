import type { EntityColumn } from "@/components/entity-table";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import type { EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import type { RowAction } from "@/components/row-actions";
import { usePendingAction } from "@/hooks/usePendingAction";
import { deleteReport, getReportPrintUrl, updateReport } from "@/lib/api";
import { lazyWithPrefetch, useHasBeenOpen } from "@/lib/lazyDialog";
import { toReportUpdatePayload } from "@/lib/reportForm";
import { openPrintWindow } from "@/lib/utils";
import type { ReportDto } from "@/types/dtos";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";

const { Component: EditReportDialog, prefetch: prefetchEditReportDialog } = lazyWithPrefetch(
    () => import("@/components/dialogs/edit/editReportDialog")
);

export { prefetchEditReportDialog };

/**
 * La colonna dei pulsanti, da aggiungere in coda alle colonne di una tabella di report che usa
 * `useReportRowActions` e non l'ha già: `EntityTable` disegna le azioni solo nella colonna `actions`.
 */
export const reportActionsColumn: EntityColumn<ReportDto> = {
    key: "actions",
    header: "Azioni",
    className: "text-right",
    render: () => null,
};

type ReportRowActionsOptions = {
    /** Dopo una modifica o un'eliminazione riuscita: di norma ricarica la lista (e la scheda). */
    onChanged: () => Promise<unknown> | void;
};

/**
 * Le azioni di riga di un report (modifica, stampa, eliminazione) con i loro dialoghi, uguali
 * ovunque compaia una lista di report: la lista principale e la scheda del cliente. Nella scheda
 * prima si poteva solo aprire il report.
 *
 * Restituisce `getRowActions` per `EntityTable` e `dialogs`, da mettere una volta nella
 * pagina. Il dialogo di modifica si scarica solo alla prima apertura (`lazyWithPrefetch`).
 */
export const useReportRowActions = ({ onChanged }: ReportRowActionsOptions) => {
    // Un solo stato per dialogo + bersaglio: `open={reportToEdit != null}` basta da solo.
    const [reportToEdit, setReportToEdit] = useState<ReportDto | null>(null);
    const hasOpenedEditDialog = useHasBeenOpen(reportToEdit != null);

    const deleteAction = usePendingAction({
        run: (report: ReportDto) => deleteReport(report.id),
        successMessage: "Report eliminato con successo",
        errorMessage: "Impossibile eliminare il report",
        onDone: () => onChanged(),
    });

    const handleEditReport = async (values: EditReportSubmitValues) => {
        await updateReport(values.reportId, toReportUpdatePayload(values));
        // Niente ritocco della riga in pagina prima di ricaricare: la lista si ricarica subito
        // comunque (la riga può anche uscire dal filtro), e il ritocco copiava sul client regole
        // del server (il totale come prezzo interno più compenso del tecnico), mostrando per un istante una riga a metà.
        await onChanged();
    };

    const getRowActions = (row: ReportDto): RowAction[] => [
        {
            key: "edit",
            label: "Modifica",
            ariaLabel: `Modifica report ${row.id}`,
            icon: Pencil,
            onSelect: () => setReportToEdit(row),
            onPointerEnter: prefetchEditReportDialog,
        },
        {
            key: "print",
            label: "Stampa",
            ariaLabel: `Stampa report ${row.id}`,
            icon: Printer,
            tone: "print",
            onSelect: () => openPrintWindow(getReportPrintUrl(row.id)),
        },
        {
            key: "delete",
            label: "Elimina",
            ariaLabel: `Elimina report ${row.id}`,
            icon: Trash2,
            variant: "destructive",
            onSelect: () => deleteAction.open(row),
        },
    ];

    const dialogs = (
        <>
            {hasOpenedEditDialog ? (
                <Suspense fallback={null}>
                    <EditReportDialog
                        open={reportToEdit != null}
                        reportId={reportToEdit?.id ?? null}
                        customerName={reportToEdit?.customer ?? ""}
                        onOpenChange={(open) => {
                            if (!open) {
                                setReportToEdit(null);
                            }
                        }}
                        onSubmit={handleEditReport}
                    />
                </Suspense>
            ) : null}

            <ConfirmDeleteDialog
                open={deleteAction.isOpen}
                onOpenChange={deleteAction.onOpenChange}
                title="Elimina report"
                description={
                    deleteAction.pending
                        ? `Sei sicuro di voler eliminare il report ID ${deleteAction.pending.id}?`
                        : "Sei sicuro di voler eliminare questo report?"
                }
                isDeleting={deleteAction.isRunning}
                onConfirm={deleteAction.confirm}
            />
        </>
    );

    return { getRowActions, dialogs };
};
