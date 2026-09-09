import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import CreateEntityButton from "@/components/create-entity-button";
import EntityCrudTable from "@/components/entity-crud-table";
import type { EntityColumn } from "@/components/entity-table";
import LoadingPage from "@/components/loadingPage";
import PageHeader from "@/components/page-header";
import RefreshButton from "@/components/refresh-button";
import SearchInput from "@/components/search-input";
import TablePagination from "@/components/table-pagination";
import { useSearchableRows } from "@/hooks/useSearchableRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { getApiErrorMessage } from "@/lib/api";
import type { PaginatedResponse } from "@/lib/api/client";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

/**
 * Le proprietà che il dialogo di un'anagrafica deve accettare per stare qui dentro. Sono
 * quelle che i dialoghi `create*` hanno già: uno solo serve sia a creare che a modificare,
 * distinguendo i due casi con `mode`.
 */
export type EntityDialogProps<TRow, TValues> = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: TValues) => Promise<void> | void;
    mode?: "create" | "edit";
    initialValues?: TRow | null;
};

type SimpleEntityPageProps<TRow extends { id: number }, TValues> = {
    title: string;
    description: string;
    /** Etichetta del pulsante di creazione, es. "Crea nuovo tecnico". */
    createLabel: string;
    searchPlaceholder: string;
    /** Al singolare e minuscolo ("tecnico"): finisce nelle etichette di accessibilità. */
    entityLabel: string;
    /** Chiave delle preferenze salvate (larghezze colonne, righe per pagina). */
    tableKey: string;
    columns: EntityColumn<TRow>[];
    emptyMessage: string;
    listRows: (params: {
        page: number;
        pageSize: number;
        search: string;
        signal: AbortSignal;
    }) => Promise<PaginatedResponse<TRow>>;
    loadErrorMessage: string;
    /** Il dialogo dell'entità, usato sia in creazione sia in modifica. */
    Dialog: (props: EntityDialogProps<TRow, TValues>) => ReactNode;
    onCreate: (values: TValues) => Promise<unknown>;
    onEdit: (row: TRow, values: TValues) => Promise<unknown>;
    onDelete: (row: TRow) => Promise<unknown>;
    /** Mostrato se si prova a modificare una riga sparita nel frattempo. */
    notFoundMessage: string;
    deleteTitle: string;
    /** Il testo cambia con l'entità perché cambia il nome da mostrare, e l'articolo. */
    deleteDescription: (row: TRow) => string;
    deleteFallbackDescription: string;
    deleteSuccessMessage: string;
    deleteErrorMessage: string;
    /** Solo per le entità che hanno una scheda propria: dove portare il pulsante "Apri". */
    onOpenRow?: (id: number) => void;
    /** Righe che il server non lascia modificare né eliminare: vedi `EntityCrudTable`. */
    isRowLocked?: (row: TRow) => boolean;
};

/**
 * Le pagine delle quattro anagrafiche — tecnici, collaboratori, dispositivi, difetti.
 *
 * Erano quattro file di circa 190 righe l'uno, identici riga per riga a meno dei nomi dei
 * campi e delle scritte: stessa ricerca con debounce, stessa paginazione, stessi tre
 * dialoghi, stessa gestione degli errori. È la stessa duplicazione che il backend aveva già
 * eliminato con `createCrudRouter` e che le tabelle avevano già eliminato con `EntityTable`;
 * qui restava la pagina.
 *
 * Restano fuori di proposito clienti, report e interventi: hanno filtri, ordinamenti e
 * azioni di riga propri, e ridurli a configurazione costerebbe più di quanto farebbe
 * risparmiare.
 */
const SimpleEntityPage = <TRow extends { id: number }, TValues>({
    title,
    description,
    createLabel,
    searchPlaceholder,
    entityLabel,
    tableKey,
    columns,
    emptyMessage,
    listRows,
    loadErrorMessage,
    Dialog,
    onCreate,
    onEdit,
    onDelete,
    notFoundMessage,
    deleteTitle,
    deleteDescription,
    deleteFallbackDescription,
    deleteSuccessMessage,
    deleteErrorMessage,
    onOpenRow,
    isRowLocked,
}: SimpleEntityPageProps<TRow, TValues>) => {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [rowToEdit, setRowToEdit] = useState<TRow | null>(null);
    const [rowToDelete, setRowToDelete] = useState<TRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [pageSize, setPageSize] = useTableRowsPerPage(tableKey);
    const { currentPage, setCurrentPage } = useTablePagination({ resetDependencies: [searchText, pageSize] });
    const { rows, totalItems, totalPages, isLoading, reload } = useSearchableRows<TRow>({
        fetchRows: listRows,
        searchText,
        currentPage,
        pageSize,
        errorMessage: loadErrorMessage,
    });

    const handleCreate = async (values: TValues) => {
        await onCreate(values);
        await reload();
    };

    const handleOpenEditDialog = (id: number) => {
        const row = rows.find((item) => item.id === id);

        if (!row) {
            toast.error(notFoundMessage);
            return;
        }

        setRowToEdit(row);
        setIsEditDialogOpen(true);
    };

    const handleEdit = async (values: TValues) => {
        if (!rowToEdit) {
            return;
        }

        await onEdit(rowToEdit, values);
        await reload();
    };

    const handleOpenDeleteDialog = (row: TRow) => {
        setRowToDelete(row);
        setIsDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!rowToDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await onDelete(rowToDelete);
            toast.success(deleteSuccessMessage);
            setIsDeleteDialogOpen(false);
            setRowToDelete(null);
            await reload();
        } catch (error) {
            toast.error(getApiErrorMessage(error, deleteErrorMessage));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <PageHeader
                title={title}
                description={description}
                action={<CreateEntityButton label={createLabel} onClick={() => setIsCreateDialogOpen(true)} />}
            />

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onSubmit={handleCreate} />

            <Dialog
                open={isEditDialogOpen}
                onOpenChange={(open) => {
                    setIsEditDialogOpen(open);
                    if (!open) {
                        setRowToEdit(null);
                    }
                }}
                mode="edit"
                initialValues={rowToEdit}
                onSubmit={handleEdit}
            />

            <ConfirmDeleteDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    setIsDeleteDialogOpen(open);
                    if (!open) {
                        setRowToDelete(null);
                    }
                }}
                title={deleteTitle}
                description={rowToDelete ? deleteDescription(rowToDelete) : deleteFallbackDescription}
                isDeleting={isDeleting}
                onConfirm={handleDelete}
            />

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <RefreshButton onRefresh={reload} isRefreshing={isLoading} />
                <SearchInput value={searchText} onValueChange={setSearchText} placeholder={searchPlaceholder} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <EntityCrudTable
                        tableKey={tableKey}
                        columns={columns}
                        rows={rows}
                        emptyMessage={emptyMessage}
                        entityLabel={entityLabel}
                        onOpen={onOpenRow}
                        onEdit={handleOpenEditDialog}
                        onDelete={handleOpenDeleteDialog}
                        isRowLocked={isRowLocked}
                    />
                </div>
                <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            </div>

            {isLoading ? (
                <LoadingPage className="absolute inset-0 z-10 rounded-2xl bg-background/70 backdrop-blur-sm" />
            ) : null}
        </div>
    );
};

export default SimpleEntityPage;
