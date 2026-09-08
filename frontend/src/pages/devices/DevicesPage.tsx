import CreateEntityButton from "@/components/create-entity-button";
import CreateDeviceDialog from "@/components/dialogs/create/createDeviceDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import LoadingPage from "@/components/loadingPage";
import PageHeader from "@/components/page-header";
import RefreshButton from "@/components/refresh-button";
import TablePagination from "@/components/table-pagination";
import { createDevice, deleteDevice, getApiErrorMessage, listDevices, updateDevice } from "@/lib/api";
import { useEffect, useState } from "react";
import type { DeviceDto } from "@/types/dtos";
import { toast } from "sonner";
import { deviceColumns } from "./components/device-columns";
import SearchInput from "@/components/search-input";
import DevicesTable from "./components/devices-table";
import { useSearchableRows } from "@/hooks/useSearchableRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";

const DevicesPage = () => {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deviceToEdit, setDeviceToEdit] = useState<DeviceDto | null>(null);
    const [deviceToDelete, setDeviceToDelete] = useState<DeviceDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [pageSize, setPageSize] = useTableRowsPerPage("devices");
    const { currentPage, setCurrentPage } = useTablePagination({ resetDependencies: [searchText, pageSize] });
    const {
        rows: deviceRows,
        totalItems,
        totalPages,
        isLoading,
        reload: loadDevices,
    } = useSearchableRows<DeviceDto>({
        fetchRows: listDevices,
        searchText,
        currentPage,
        pageSize,
        errorMessage: "Impossibile caricare i dispositivi",
    });

    const handleCreateDevice = async (values: Record<string, string | boolean>) => {
        await createDevice({
            name: String(values.name).trim(),
        });

        await loadDevices();
    };

    const handleOpenDeleteDialog = (device: DeviceDto) => {
        setDeviceToDelete(device);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenEditDialog = (id: number) => {
        const device = deviceRows.find((item) => item.id === id);

        if (!device) {
            toast.error("Dispositivo non trovato");
            return;
        }

        setDeviceToEdit(device);
        setIsEditDialogOpen(true);
    };

    const handleEditDevice = async (values: Record<string, string | boolean>) => {
        if (!deviceToEdit) {
            return;
        }

        await updateDevice(deviceToEdit.id, {
            name: String(values.name).trim(),
        });

        await loadDevices();
    };

    const handleDeleteDevice = async () => {
        if (!deviceToDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteDevice(deviceToDelete.id);
            toast.success("Dispositivo eliminato con successo");
            setIsDeleteDialogOpen(false);
            setDeviceToDelete(null);
            await loadDevices();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile eliminare il dispositivo"));
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        void loadDevices();
    }, [loadDevices]);

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <PageHeader
                title="Dispositivi"
                description="Gestisci i dispositivi del laboratorio."
                action={
                    <div className="flex items-center gap-2">
                        <RefreshButton onRefresh={loadDevices} isRefreshing={isLoading} />
                        <CreateEntityButton
                            label="Crea nuovo dispositivo"
                            onClick={() => setIsCreateDialogOpen(true)}
                        />
                    </div>
                }
            />

            <CreateDeviceDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSubmit={handleCreateDevice}
            />

            <CreateDeviceDialog
                open={isEditDialogOpen}
                onOpenChange={(open) => {
                    setIsEditDialogOpen(open);
                    if (!open) {
                        setDeviceToEdit(null);
                    }
                }}
                mode="edit"
                initialValues={deviceToEdit}
                onSubmit={handleEditDevice}
            />

            <ConfirmDeleteDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    setIsDeleteDialogOpen(open);
                    if (!open) {
                        setDeviceToDelete(null);
                    }
                }}
                title="Elimina dispositivo"
                description={
                    deviceToDelete
                        ? `Sei sicuro di voler eliminare il dispositivo ${deviceToDelete.name}?`
                        : "Sei sicuro di voler eliminare questo dispositivo?"
                }
                isDeleting={isDeleting}
                onConfirm={handleDeleteDevice}
            />

            <SearchInput value={searchText} onValueChange={setSearchText} placeholder="Cerca dispositivo..." />

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <DevicesTable
                        columns={deviceColumns}
                        rows={deviceRows}
                        onEditDevice={handleOpenEditDialog}
                        onDeleteDevice={handleOpenDeleteDialog}
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

export default DevicesPage;
