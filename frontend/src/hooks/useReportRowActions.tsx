import type { EntityColumn } from "@/components/entity-table";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import type { EditReportSubmitValues } from "@/components/dialogs/edit/editReportDialog";
import TableActionButton from "@/components/table-action-button";
import { usePendingAction } from "@/hooks/usePendingAction";
import { deleteReport, getReportPrintUrl, updateReport } from "@/lib/api";
import { lazyWithPrefetch, useHasBeenOpen } from "@/lib/lazyDialog";
import { toReportUpdatePayload } from "@/lib/reportForm";
import { openPrintWindow } from "@/lib/utils";
import type { ReportDto } from "@/types/dtos";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";

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
 * Restituisce `renderRowActions` per `EntityTable` e `dialogs`, da mettere una volta nella
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

    const renderRowActions = (row: ReportDto): ReactNode => (
        <>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-muted hover:bg-primary/20"
                onClick={() => setReportToEdit(row)}
                onPointerEnter={prefetchEditReportDialog}
                aria-label={`Modifica report ${row.id}`}
            >
                <Pencil className="size-5 text-muted-foreground transition-colors group-hover/button:text-primary" />
            </TableActionButton>
            <TableActionButton
                variant="default"
                size="icon-lg"
                className="bg-muted hover:bg-action-print/20"
                onClick={() => openPrintWindow(getReportPrintUrl(row.id))}
                aria-label={`Stampa report ${row.id}`}
            >
                <Printer className="size-5 text-muted-foreground transition-colors group-hover/button:text-action-print" />
            </TableActionButton>
            <TableActionButton
                variant="destructive"
                size="icon-lg"
                onClick={() => deleteAction.open(row)}
                aria-label={`Elimina report ${row.id}`}
            >
                <Trash2 className="size-5" />
            </TableActionButton>
        </>
    );

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

    return { renderRowActions, dialogs };
};
