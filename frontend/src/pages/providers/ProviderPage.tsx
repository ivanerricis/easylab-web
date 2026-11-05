import { contractStatusColor } from "@/lib/contracts";
import DetailDeleteButton from "@/components/detail-delete-button";
import { DetailHeader, DetailHeaderAction } from "@/components/detail-header";
import DetailStats from "@/components/detail-stats";
import CreateProviderDialog, { type ProviderSubmitValues } from "@/components/dialogs/create/createProviderDialog";
import EntityDetailGate from "@/components/entity-detail-gate";
import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import RefreshButton from "@/components/refresh-button";
import TablePagination from "@/components/table-pagination";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import { useGoBack } from "@/hooks/useGoBack";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { useTablePagination } from "@/hooks/useTablePagination";
import { useTableRowsPerPage } from "@/hooks/useTableRowsPerPage";
import { deleteProvider, getProvider, listContracts, updateProvider } from "@/lib/api";
import { resolveEmptyListMessage } from "@/lib/emptyListMessage";
import { entityPaths } from "@/lib/entityPaths";
import { formatProviderContact, toProviderPayload } from "@/lib/providers";
import type { ContractDto } from "@/types/dtos";
import { Pencil } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { contractColumnsWithout } from "../contracts/components/contract-columns";

/**
 * La scheda del fornitore: i suoi dati e i contratti stipulati con lui.
 *
 * Stessa forma della scheda del tecnico esterno: riquadro con i dati, poi la tabella dei contratti
 * con la sua impaginazione (del server, come lì) in fondo.
 */
const ProviderPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    // Serve anche alla lista dei contratti sotto, indipendentemente dal caricamento del fornitore.
    const providerId = Number(id);
    const {
        data: provider,
        isLoading: isProviderLoading,
        isReloading: isProviderReloading,
        isNotFound,
        reload: reloadProvider,
        setData: setProvider,
    } = useEntityDetail(id, getProvider, {
        backTo: "/providers",
        errorMessage: "Impossibile caricare il fornitore",
    });
    const providerName = provider?.providerName ?? "Fornitore";
    useDocumentTitle(providerName);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const handleBack = useGoBack("/providers");
    const columns = useMemo(() => contractColumnsWithout("providerName"), []);

    const [pageSize, setPageSize] = useTableRowsPerPage("provider-contracts");
    const { currentPage, setCurrentPage } = useTablePagination({ resetDependencies: [pageSize] });

    const {
        rows: contracts,
        totalItems,
        totalPages,
        isInitialLoading: areContractsInitialLoading,
        isRefetching: areContractsRefetching,
        isLoading: areContractsLoading,
        error: contractsLoadError,
        reload: reloadContracts,
    } = usePaginatedRows<ContractDto>({
        fetchRows: (signal) =>
            listContracts({ page: currentPage, pageSize, providerId, sortBy: "startDate", sortOrder: "desc", signal }),
        queryKey: [providerId, currentPage, pageSize],
        errorMessage: "Impossibile caricare i contratti del fornitore",
        initialLoading: false,
        page: currentPage,
        onPageOutOfRange: setCurrentPage,
    });

    // Il nome e il riquadro si aggiornano con il fornitore che il server restituisce, senza un
    // secondo giro di rete (come nella scheda del tecnico).
    const handleEditProvider = async (values: ProviderSubmitValues) => {
        setProvider(await updateProvider(providerId, toProviderPayload(values)));
    };

    const handleRefresh = useCallback(async () => {
        await Promise.all([reloadProvider(), reloadContracts()]);
    }, [reloadProvider, reloadContracts]);

    if (isNotFound || (isProviderLoading && !provider)) {
        return (
            <EntityDetailGate
                isNotFound={isNotFound}
                isLoading={isProviderLoading}
                variant="provider"
                notFound={{
                    title: "Fornitore non trovato",
                    description: "Il fornitore che cerchi non esiste, oppure è stato eliminato.",
                    backTo: "/providers",
                    backLabel: "Vai ai fornitori",
                }}
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-4">
            <DetailHeader onBack={handleBack} title={providerName} hideTitleOnMobile={provider != null}>
                <RefreshButton
                    onRefresh={handleRefresh}
                    isRefreshing={areContractsLoading || isProviderReloading}
                    label="Aggiorna i dati del fornitore"
                />

                <DetailHeaderAction
                    variant="outline"
                    icon={Pencil}
                    text="Modifica"
                    onClick={() => setIsEditDialogOpen(true)}
                    aria-label="Modifica fornitore"
                />

                <DetailDeleteButton
                    label="Elimina fornitore"
                    title="Elimina fornitore"
                    description={`Sei sicuro di voler eliminare il fornitore ${providerName}?`}
                    onDelete={() => deleteProvider(providerId)}
                    successMessage="Fornitore eliminato con successo"
                    errorMessage="Impossibile eliminare il fornitore"
                    redirectTo="/providers"
                />
            </DetailHeader>

            {isEditDialogOpen && provider ? (
                <CreateProviderDialog
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    mode="edit"
                    initialValues={provider}
                    onSubmit={handleEditProvider}
                />
            ) : null}

            {provider ? (
                // Le stesse card dei dati del cliente e del tecnico. Sotto `sm` diventano una card sola
                // con il nome come titolo (vedi `DetailStats`).
                <DetailStats
                    mobileTitle={providerName}
                    gridClassName="xl:grid-cols-3"
                    items={[
                        { label: "Referente", value: formatProviderContact(provider) },
                        // `break-all`: un indirizzo lungo non ha punti dove andare a capo e usciva dalla card.
                        { label: "Email", value: <span className="break-all">{provider.email}</span> },
                        { label: "Telefono", value: provider.phoneNumber },
                    ]}
                />
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3">
                <h2 className="text-lg font-semibold">Contratti</h2>

                <div className="min-h-0 flex-1 overflow-auto">
                    <EntityTable
                        tableKey="provider-contracts"
                        columns={columns}
                        rows={contracts}
                        getRowKey={(row) => row.id}
                        getRowStatusColor={(row) => contractStatusColor(row.effectiveStatus)}
                        emptyMessage={resolveEmptyListMessage({
                            emptyMessage: "Nessun contratto con questo fornitore.",
                        })}
                        loadError={contractsLoadError}
                        onRetry={() => void reloadContracts()}
                        renderRowActions={(row) => (
                            <OpenEntityButton
                                size="icon-lg"
                                to={entityPaths.contract(row.id)}
                                aria-label={`Apri contratto ${row.id}`}
                            />
                        )}
                        onRowOpen={(row) => void navigate(entityPaths.contract(row.id))}
                        isInitialLoading={areContractsInitialLoading}
                        isRefetching={areContractsRefetching}
                        skeletonRowCount={pageSize}
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

export default ProviderPage;
