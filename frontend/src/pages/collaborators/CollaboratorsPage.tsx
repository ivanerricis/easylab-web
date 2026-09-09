import CreateEntityButton from "@/components/create-entity-button";
import CreateCollaboratorDialog from "@/components/dialogs/create/createCollaboratorDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import LoadingPage from "@/components/loadingPage";
import PageHeader from "@/components/page-header";
import RefreshButton from "@/components/refresh-button";
import TablePagination from "@/components/table-pagination";
import {
    createCollaborator,
    deleteCollaborator,
    getApiErrorMessage,
    listCollaborators,
    updateCollaborator,
} from "@/lib/api";
import { useState } from "react";
import type { CollaboratorDto } from "@/types/dtos";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { collaboratorColumns } from "./components/collaborator-columns";
import SearchInput from "@/components/search-input";
import CollaboratorsTable from "./components/collaborators-table";
import { useSearchableRows } from "@/hooks/useSearchableRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

const CollaboratorsPage = () => {
    const navigate = useNavigate();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [collaboratorToEdit, setCollaboratorToEdit] = useState<CollaboratorDto | null>(null);
    const [collaboratorToDelete, setCollaboratorToDelete] = useState<CollaboratorDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [pageSize, setPageSize] = useTableRowsPerPage("collaborators");
    const { currentPage, setCurrentPage } = useTablePagination({ resetDependencies: [searchText, pageSize] });
    const {
        rows: collaboratorRows,
        totalItems,
        totalPages,
        isLoading,
        reload: loadCollaborators,
    } = useSearchableRows<CollaboratorDto>({
        fetchRows: listCollaborators,
        searchText,
        currentPage,
        pageSize,
        errorMessage: "Impossibile caricare i collaboratori",
    });

    const handleCreateCollaborator = async (values: Record<string, string | boolean>) => {
        await createCollaborator({
            firstName: String(values.firstName).trim(),
            lastName: String(values.lastName).trim() === "" ? null : String(values.lastName).trim(),
            phoneNumber: String(values.phoneNumber).trim() === "" ? null : String(values.phoneNumber).trim(),
        });

        await loadCollaborators();
    };

    const handleOpenDeleteDialog = (collaborator: CollaboratorDto) => {
        setCollaboratorToDelete(collaborator);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenEditDialog = (id: number) => {
        const collaborator = collaboratorRows.find((item) => item.id === id);

        if (!collaborator) {
            toast.error("Collaboratore non trovato");
            return;
        }

        setCollaboratorToEdit(collaborator);
        setIsEditDialogOpen(true);
    };

    const handleEditCollaborator = async (values: Record<string, string | boolean>) => {
        if (!collaboratorToEdit) {
            return;
        }

        await updateCollaborator(collaboratorToEdit.id, {
            firstName: String(values.firstName).trim(),
            lastName: String(values.lastName).trim() === "" ? null : String(values.lastName).trim(),
            phoneNumber: String(values.phoneNumber).trim() === "" ? null : String(values.phoneNumber).trim(),
        });

        await loadCollaborators();
    };

    const handleOpenCollaborator = (id: number) => {
        navigate(`/collaborators/${id}`);
    };

    const handleDeleteCollaborator = async () => {
        if (!collaboratorToDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteCollaborator(collaboratorToDelete.id);
            toast.success("Collaboratore eliminato con successo");
            setIsDeleteDialogOpen(false);
            setCollaboratorToDelete(null);
            await loadCollaborators();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile eliminare il collaboratore"));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <PageHeader
                title="Collaboratori"
                description="Gestisci i collaboratori del laboratorio."
                action={
                    <CreateEntityButton label="Crea nuovo collaboratore" onClick={() => setIsCreateDialogOpen(true)} />
                }
            />

            <CreateCollaboratorDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSubmit={handleCreateCollaborator}
            />

            <CreateCollaboratorDialog
                open={isEditDialogOpen}
                onOpenChange={(open) => {
                    setIsEditDialogOpen(open);
                    if (!open) {
                        setCollaboratorToEdit(null);
                    }
                }}
                mode="edit"
                initialValues={collaboratorToEdit}
                onSubmit={handleEditCollaborator}
            />

            <ConfirmDeleteDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    setIsDeleteDialogOpen(open);
                    if (!open) {
                        setCollaboratorToDelete(null);
                    }
                }}
                title="Elimina collaboratore"
                description={
                    collaboratorToDelete
                        ? `Sei sicuro di voler eliminare il collaboratore ${collaboratorToDelete.firstName} ${collaboratorToDelete.lastName ?? ""}?`
                        : "Sei sicuro di voler eliminare questo collaboratore?"
                }
                isDeleting={isDeleting}
                onConfirm={handleDeleteCollaborator}
            />

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <RefreshButton onRefresh={loadCollaborators} isRefreshing={isLoading} />
                <SearchInput value={searchText} onValueChange={setSearchText} placeholder="Cerca collaboratore..." />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <CollaboratorsTable
                        columns={collaboratorColumns}
                        rows={collaboratorRows}
                        onOpenCollaborator={handleOpenCollaborator}
                        onEditCollaborator={handleOpenEditDialog}
                        onDeleteCollaborator={handleOpenDeleteDialog}
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

export default CollaboratorsPage;
