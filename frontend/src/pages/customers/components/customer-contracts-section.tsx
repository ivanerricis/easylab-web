import EntityTable from "@/components/entity-table";
import FilterSelect from "@/components/filters/filter-select";
import TableActionButton from "@/components/table-action-button";
import TablePagination from "@/components/table-pagination";
import type { CustomerContractsList } from "@/hooks/useCustomerContracts";
import { getContractPrintUrl } from "@/lib/api";
import { contractEffectiveStatusOptions, contractPrintName, contractStatusColor } from "@/lib/contracts";
import { entityPaths } from "@/lib/entityPaths";
import { openPrintWindow } from "@/lib/utils";
import { contractColumnsWithout } from "@/pages/contracts/components/contract-columns";
import { ListFilter, Printer } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

/**
 * I contratti del cliente nella terza tab della sua scheda, accanto a report e interventi, con
 * filtro per stato e impaginazione come loro. All'inizio erano una sezione a sé sopra le tab, con
 * un'altezza massima: toglieva spazio alle due liste anche a chi i contratti non li guardava.
 * "Nuovo contratto" sta nel menu "Nuovo" dell'intestazione, con report e intervento.
 */
export const CustomerContractsFilter = ({ contracts }: { contracts: CustomerContractsList }) => (
    <FilterSelect
        variant="inline"
        value={contracts.filter}
        onValueChange={contracts.setFilter}
        options={contractEffectiveStatusOptions}
        allOption={{ value: "all", label: "Tutti i contratti" }}
        label="Filtra i contratti per stato"
        icon={ListFilter}
    />
);

export const CustomerContractsTable = ({ contracts }: { contracts: CustomerContractsList }) => {
    const navigate = useNavigate();
    // La colonna del cliente no: nella sua scheda sarebbe sempre lo stesso nome.
    const columns = useMemo(() => contractColumnsWithout("customerName"), []);

    return (
        <>
            {/* Come le altre due tab: l'area scorre da sola e l'impaginazione resta ferma in fondo. */}
            <div className="min-h-0 flex-1 overflow-auto">
                <EntityTable
                    tableKey="customer-contracts"
                    columns={columns}
                    rows={contracts.rows}
                    getRowKey={(row) => row.id}
                    getRowStatusColor={(row) => contractStatusColor(row.effectiveStatus)}
                    emptyMessage="Nessun contratto associato a questo cliente."
                    renderRowActions={(row) => (
                        <>
                            <TableActionButton
                                variant="default"
                                size="icon-lg"
                                className="bg-muted hover:bg-action-print/20"
                                onClick={() => openPrintWindow(getContractPrintUrl(row.id))}
                                aria-label={`Stampa ${contractPrintName(row.effectiveStatus)} ${row.id}`}
                            >
                                <Printer className="size-5 text-muted-foreground transition-colors group-hover/button:text-action-print" />
                            </TableActionButton>
                        </>
                    )}
                    onRowOpen={(row) => void navigate(entityPaths.contract(row.id))}
                    isInitialLoading={contracts.isInitialLoading}
                    isRefetching={contracts.isRefetching}
                    loadError={contracts.error}
                    onRetry={() => void contracts.reload()}
                    skeletonRowCount={contracts.pageSize}
                />
            </div>

            <TablePagination
                currentPage={contracts.page}
                totalPages={contracts.totalPages}
                totalItems={contracts.totalItems}
                pageSize={contracts.pageSize}
                onPageChange={contracts.setPage}
                onPageSizeChange={contracts.setPageSize}
            />
        </>
    );
};
