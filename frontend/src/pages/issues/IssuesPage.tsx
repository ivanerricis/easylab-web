import CreateEntityButton from "@/components/create-entity-button";
import CreateIssueDialog from "@/components/dialogs/create/createIssueDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import LoadingPage from "@/components/loadingPage";
import PageHeader from "@/components/page-header";
import RefreshButton from "@/components/refresh-button";
import TablePagination from "@/components/table-pagination";
import { createIssue, deleteIssue, getApiErrorMessage, listIssues, updateIssue } from "@/lib/api";
import { useEffect, useState } from "react";
import type { IssueDto } from "@/types/dtos";
import { toast } from "sonner";
import { issueColumns } from "./components/issue-columns";
import SearchInput from "@/components/search-input";
import IssuesTable from "./components/issues-table";
import { useSearchableRows } from "@/hooks/useSearchableRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

const IssuesPage = () => {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [issueToEdit, setIssueToEdit] = useState<IssueDto | null>(null);
    const [issueToDelete, setIssueToDelete] = useState<IssueDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [pageSize, setPageSize] = useTableRowsPerPage("issues");
    const { currentPage, setCurrentPage } = useTablePagination({ resetDependencies: [searchText, pageSize] });
    const {
        rows: issueRows,
        totalItems,
        totalPages,
        isLoading,
        reload: loadIssues,
    } = useSearchableRows<IssueDto>({
        fetchRows: listIssues,
        searchText,
        currentPage,
        pageSize,
        errorMessage: "Impossibile caricare i difetti",
    });

    const handleCreateIssue = async (values: Record<string, string | boolean>) => {
        await createIssue({
            description: String(values.description).trim(),
        });

        await loadIssues();
    };

    const handleOpenDeleteDialog = (issue: IssueDto) => {
        setIssueToDelete(issue);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenEditDialog = (id: number) => {
        const issue = issueRows.find((item) => item.id === id);

        if (!issue) {
            toast.error("Difetto non trovato");
            return;
        }

        setIssueToEdit(issue);
        setIsEditDialogOpen(true);
    };

    const handleEditIssue = async (values: Record<string, string | boolean>) => {
        if (!issueToEdit) {
            return;
        }

        await updateIssue(issueToEdit.id, {
            description: String(values.description).trim(),
        });

        await loadIssues();
    };

    const handleDeleteIssue = async () => {
        if (!issueToDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteIssue(issueToDelete.id);
            toast.success("Difetto eliminato con successo");
            setIsDeleteDialogOpen(false);
            setIssueToDelete(null);
            await loadIssues();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile eliminare il difetto"));
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        void loadIssues();
    }, [loadIssues]);

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <PageHeader
                title="Difetti"
                description="Gestisci i difetti del laboratorio."
                action={<CreateEntityButton label="Crea nuovo difetto" onClick={() => setIsCreateDialogOpen(true)} />}
            />
            <CreateIssueDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSubmit={handleCreateIssue}
            />

            <CreateIssueDialog
                open={isEditDialogOpen}
                onOpenChange={(open) => {
                    setIsEditDialogOpen(open);
                    if (!open) {
                        setIssueToEdit(null);
                    }
                }}
                mode="edit"
                initialValues={issueToEdit}
                onSubmit={handleEditIssue}
            />

            <ConfirmDeleteDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    setIsDeleteDialogOpen(open);
                    if (!open) {
                        setIssueToDelete(null);
                    }
                }}
                title="Elimina difetto"
                description={
                    issueToDelete
                        ? `Sei sicuro di voler eliminare il difetto: ${issueToDelete.description}?`
                        : "Sei sicuro di voler eliminare questo difetto?"
                }
                isDeleting={isDeleting}
                onConfirm={handleDeleteIssue}
            />

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <RefreshButton onRefresh={loadIssues} isRefreshing={isLoading} />
                <SearchInput value={searchText} onValueChange={setSearchText} placeholder="Cerca difetto..." />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <IssuesTable
                        columns={issueColumns}
                        rows={issueRows}
                        onEditIssue={handleOpenEditDialog}
                        onDeleteIssue={handleOpenDeleteDialog}
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

export default IssuesPage;
