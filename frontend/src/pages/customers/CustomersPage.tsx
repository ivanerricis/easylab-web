import CreateEntityButton from "@/components/create-entity-button";
import CreateCustomerDialog, { type CustomerSubmitValues } from "@/components/dialogs/create/createCustomerDialog";
import ConfirmDeleteDialog from "@/components/dialogs/delete/confirmDeleteDialog";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import PageHeader from "@/components/page-header";
import TablePagination from "@/components/table-pagination";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    createCustomer,
    deleteCustomer,
    getApiErrorMessage,
    updateCustomer,
    getCustomerReportsPrintUrl,
    getCustomerInterventionsPrintUrl,
} from "@/lib/api";
import { useState } from "react";
import type { CustomerDto } from "@/types/dtos";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { customerColumns } from "./components/customer-columns";
import CustomersFilters from "./components/customers-filters";
import CustomersTable from "./components/customers-table";
import { DEFAULT_CUSTOMER_SORT_OPTION, type CustomerSortOption } from "./components/types";
import { useCustomersRows } from "./hooks/useCustomersRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { openPrintWindow, trimOrNull } from "@/lib/utils";

type CustomerPrintKind = "reports" | "interventions";

const toCustomerPayload = (values: CustomerSubmitValues) => ({
    firstName: values.firstName.trim(),
    lastName: trimOrNull(values.lastName),
    phoneNumber: trimOrNull(values.phoneNumber),
    phoneNumberSecondary: trimOrNull(values.phoneNumberSecondary),
    email: trimOrNull(values.email),
    city: trimOrNull(values.city),
});

const CustomersPage = () => {
    const navigate = useNavigate();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [sortOption, setSortOption] = useState<CustomerSortOption>(DEFAULT_CUSTOMER_SORT_OPTION);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState<CustomerDto | null>(null);
    const [customerToDelete, setCustomerToDelete] = useState<CustomerDto | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [printCustomerId, setPrintCustomerId] = useState<number | null>(null);
    const [printKind, setPrintKind] = useState<CustomerPrintKind>("reports");
    const [pageSize, setPageSize] = useTableRowsPerPage("customers");
    const { currentPage, setCurrentPage } = useTablePagination({
        resetDependencies: [searchText, sortOption, pageSize],
    });
    const { customerRows, totalItems, totalPages, isLoading, isInitialLoading, isRefetching, loadCustomers } =
        useCustomersRows({
            searchText,
            sortOption,
            currentPage,
            pageSize,
        });

    const handleCreateCustomer = async (values: CustomerSubmitValues) => {
        await createCustomer(toCustomerPayload(values));

        await loadCustomers();
    };

    const handleOpenDeleteDialog = (customer: CustomerDto) => {
        setCustomerToDelete(customer);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenEditDialog = (id: number) => {
        const customer = customerRows.find((item) => item.id === id);

        if (!customer) {
            toast.error("Cliente non trovato");
            return;
        }

        setCustomerToEdit(customer);
        setIsEditDialogOpen(true);
    };

    const handleEditCustomer = async (values: CustomerSubmitValues) => {
        if (!customerToEdit) {
            return;
        }

        await updateCustomer(customerToEdit.id, toCustomerPayload(values));

        await loadCustomers();
    };

    const handleOpenCustomer = (id: number) => {
        navigate(`/clients/${id}`);
    };

    const handlePrintCustomer = (id: number) => {
        setPrintKind("reports");
        setPrintCustomerId(id);
    };

    const handleConfirmPrintCustomer = (range: { dateFrom?: string; dateTo?: string }) => {
        if (printCustomerId == null) {
            return;
        }

        openPrintWindow(
            printKind === "interventions"
                ? getCustomerInterventionsPrintUrl(printCustomerId, range)
                : getCustomerReportsPrintUrl(printCustomerId, range)
        );
    };

    const handleDeleteCustomer = async () => {
        if (!customerToDelete || isDeleting) {
            return;
        }

        try {
            setIsDeleting(true);
            await deleteCustomer(customerToDelete.id);
            toast.success("Cliente eliminato con successo");
            setIsDeleteDialogOpen(false);
            setCustomerToDelete(null);
            await loadCustomers();
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile eliminare il cliente"));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="relative flex h-full min-h-0 w-full flex-col gap-4">
            <PageHeader
                title="Clienti"
                description="Gestisci i clienti del laboratorio."
                action={<CreateEntityButton label="Crea nuovo cliente" onClick={() => setIsCreateDialogOpen(true)} />}
            />

            {isCreateDialogOpen && (
                <CreateCustomerDialog
                    open={isCreateDialogOpen}
                    onOpenChange={setIsCreateDialogOpen}
                    onSubmit={handleCreateCustomer}
                />
            )}

            {isEditDialogOpen && (
                <CreateCustomerDialog
                    open={isEditDialogOpen}
                    onOpenChange={(open) => {
                        setIsEditDialogOpen(open);
                        if (!open) {
                            setCustomerToEdit(null);
                        }
                    }}
                    mode="edit"
                    initialValues={customerToEdit}
                    onSubmit={handleEditCustomer}
                />
            )}

            <PrintRangeDialog
                open={printCustomerId != null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPrintCustomerId(null);
                    }
                }}
                title="Stampa resoconto cliente"
                onConfirm={handleConfirmPrintCustomer}
                extraFields={
                    <div className="grid gap-1">
                        <Label htmlFor="print-customer-kind" className="text-lg">
                            Cosa stampare
                        </Label>
                        <Select value={printKind} onValueChange={(value) => setPrintKind(value as CustomerPrintKind)}>
                            <SelectTrigger id="print-customer-kind" className="w-full text-lg!">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                <SelectItem value="reports">Report</SelectItem>
                                <SelectItem value="interventions">Interventi</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                }
            />

            {isDeleteDialogOpen && (
                <ConfirmDeleteDialog
                    open={isDeleteDialogOpen}
                    onOpenChange={(open) => {
                        setIsDeleteDialogOpen(open);
                        if (!open) {
                            setCustomerToDelete(null);
                        }
                    }}
                    title="Elimina cliente"
                    description={
                        customerToDelete
                            ? `Sei sicuro di voler eliminare il cliente ${customerToDelete.firstName} ${customerToDelete.lastName ?? ""}?`
                            : "Sei sicuro di voler eliminare questo cliente?"
                    }
                    isDeleting={isDeleting}
                    onConfirm={handleDeleteCustomer}
                />
            )}

            <CustomersFilters
                searchText={searchText}
                onSearchTextChange={setSearchText}
                sortOption={sortOption}
                onSortOptionChange={setSortOption}
                onRefresh={loadCustomers}
                isRefreshing={isLoading}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <CustomersTable
                        isInitialLoading={isInitialLoading}
                        isRefetching={isRefetching}
                        skeletonRowCount={pageSize}
                        columns={customerColumns}
                        rows={customerRows}
                        onOpenCustomer={handleOpenCustomer}
                        onPrintCustomer={handlePrintCustomer}
                        onEditCustomer={handleOpenEditDialog}
                        onDeleteCustomer={handleOpenDeleteDialog}
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
        </div>
    );
};

export default CustomersPage;
