import EntityTable, { type EntityColumn } from "@/components/entity-table";
import { interventionActionsColumn } from "@/hooks/useInterventionRowActions";
import { reportActionsColumn } from "@/hooks/useReportRowActions";
import FilterSelect from "@/components/filters/filter-select";
import TablePagination from "@/components/table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReportsAndInterventionsLists } from "@/hooks/useReportsAndInterventionsOf";
import { interventionStatusColor, interventionStatusOptions } from "@/lib/interventions";
import { reportStatusColor, reportVisibilityOptions } from "@/lib/reports";
import type { InterventionDto, ReportDto } from "@/types/dtos";
import { ListFilter } from "lucide-react";
import type { RowAction } from "@/components/row-actions";
import { useMemo, type ReactNode } from "react";

export type ReportsInterventionsTab = "reports" | "interventions" | "contracts" | "devices";

type ReportsInterventionsTabsProps = {
    activeTab: ReportsInterventionsTab;
    onTabChange: (tab: ReportsInterventionsTab) => void;
    lists: ReportsAndInterventionsLists;
    reportColumns: EntityColumn<ReportDto>[];
    interventionColumns: EntityColumn<InterventionDto>[];
    /** Le stesse chiavi dell'hook: `customer-reports`, `collaborator-interventions`. */
    tableKeyPrefix: "customer" | "collaborator";
    /** "cliente", "collaboratore": per le etichette e i messaggi di lista vuota. */
    ownerNoun: string;
    onOpenReport: (id: number) => void;
    onOpenIntervention: (id: number) => void;
    /**
     * I pulsanti di riga degli interventi (`useInterventionRowActions`). Con questa la tabella
     * ha in più la colonna delle azioni; senza, come nella scheda del collaboratore, no.
     */
    getInterventionActions?: (intervention: InterventionDto) => RowAction[];
    /**
     * I pulsanti di riga dei report (`useReportRowActions`), con la stessa regola degli
     * interventi: senza, come nella scheda del collaboratore, la tabella non ha la colonna azioni.
     */
    getReportActions?: (report: ReportDto) => RowAction[];
    /**
     * La terza tab, solo nella scheda del cliente: il filtro (sulla riga delle tab, come gli altri
     * due) e il contenuto. Senza, le tab restano due, come nella scheda del collaboratore.
     */
    contractsTab?: { filter: ReactNode; content: ReactNode };
    /** La quarta tab, solo nella scheda del cliente: i suoi dispositivi, senza filtro. */
    devicesTab?: { content: ReactNode };
};

/**
 * Le tab delle schede di cliente e collaboratore (più i contratti, solo per il cliente), con il filtro sulla stessa riga e la tabella
 * con la sua impaginazione sotto. Erano circa 120 righe identiche nelle due pagine.
 */
const ReportsInterventionsTabs = ({
    activeTab,
    onTabChange,
    lists,
    reportColumns,
    interventionColumns,
    tableKeyPrefix,
    ownerNoun,
    onOpenReport,
    onOpenIntervention,
    getInterventionActions,
    getReportActions,
    contractsTab,
    devicesTab,
}: ReportsInterventionsTabsProps) => {
    const { reports, interventions } = lists;
    // Memorizzate: un array nuovo a ogni render farebbe ridisegnare tutte le righe (`memo`).
    const hasInterventionActions = getInterventionActions != null;
    const hasReportActions = getReportActions != null;
    const reportTableColumns = useMemo(
        () => (hasReportActions ? [...reportColumns, reportActionsColumn] : reportColumns),
        [reportColumns, hasReportActions]
    );
    const interventionTableColumns = useMemo(
        () => (hasInterventionActions ? [...interventionColumns, interventionActionsColumn] : interventionColumns),
        [interventionColumns, hasInterventionActions]
    );

    return (
        <Tabs
            value={activeTab}
            onValueChange={(value) => onTabChange(value as ReportsInterventionsTab)}
            className="min-h-0 flex-1"
        >
            {/* Tab e filtro sulla stessa riga, anche su mobile: su due righe il filtro sembrava un
                controllo a sé, staccato dalla lista che filtra, e toglieva una riga alla tabella.
                Il filtro è uno solo e mostra le voci del tab aperto. */}
            <div className="flex items-center justify-between gap-2">
                <TabsList>
                    <TabsTrigger value="reports" className="px-2 sm:px-3">
                        Report
                    </TabsTrigger>
                    <TabsTrigger value="interventions" className="px-2 sm:px-3">
                        Interventi
                    </TabsTrigger>
                    {contractsTab ? (
                        <TabsTrigger value="contracts" className="px-2 sm:px-3">
                            Contratti
                        </TabsTrigger>
                    ) : null}
                    {devicesTab ? (
                        <TabsTrigger value="devices" className="px-2 sm:px-3">
                            Dispositivi
                        </TabsTrigger>
                    ) : null}
                </TabsList>
                {activeTab === "devices" ? null : activeTab === "contracts" && contractsTab ? (
                    contractsTab.filter
                ) : activeTab === "interventions" ? (
                    <FilterSelect
                        variant="inline"
                        value={interventions.filter}
                        onValueChange={interventions.setFilter}
                        options={interventionStatusOptions}
                        allOption={{ value: "all", label: "Tutti gli interventi" }}
                        label="Filtra gli interventi per stato"
                        icon={ListFilter}
                    />
                ) : (
                    <FilterSelect
                        variant="inline"
                        value={reports.filter}
                        onValueChange={reports.setFilter}
                        options={reportVisibilityOptions}
                        allOption={{ value: "all", label: "Tutti i report" }}
                        label="Filtra i report per stato"
                        icon={ListFilter}
                    />
                )}
            </div>

            <TabsContent value="reports" aria-label={`Report del ${ownerNoun}`} className="min-h-0 flex-1">
                {/* Come nelle altre pagine a elenco: quest'area scorre da sola (in entrambe le
                    direzioni — il contenitore principale del layout ha overflow-x nascosto, e
                    allargando le colonne la tabella può diventare più larga della pagina),
                    lasciando l'impaginazione ferma in fondo invece di farla scorrere via. */}
                <div className="min-h-0 flex-1 overflow-auto">
                    <EntityTable
                        tableKey={`${tableKeyPrefix}-reports`}
                        columns={reportTableColumns}
                        rows={reports.rows}
                        getRowActions={getReportActions}
                        getRowKey={(row) => row.id}
                        emptyMessage={`Nessun report associato a questo ${ownerNoun}.`}
                        getRowStatusColor={(row) => reportStatusColor(row.closed)}
                        onRowOpen={(row) => onOpenReport(row.id)}
                        isInitialLoading={reports.isInitialLoading}
                        isRefetching={reports.isRefetching}
                        loadError={reports.error}
                        onRetry={() => void reports.reload()}
                        skeletonRowCount={reports.pageSize}
                    />
                </div>

                <TablePagination
                    currentPage={reports.page}
                    totalPages={reports.totalPages}
                    totalItems={reports.totalItems}
                    pageSize={reports.pageSize}
                    onPageChange={reports.setPage}
                    onPageSizeChange={reports.setPageSize}
                />
            </TabsContent>

            <TabsContent value="interventions" aria-label={`Interventi del ${ownerNoun}`} className="min-h-0 flex-1">
                <div className="min-h-0 flex-1 overflow-auto">
                    <EntityTable
                        tableKey={`${tableKeyPrefix}-interventions`}
                        columns={interventionTableColumns}
                        rows={interventions.rows}
                        getRowActions={getInterventionActions}
                        getRowKey={(row) => row.id}
                        emptyMessage={`Nessun intervento associato a questo ${ownerNoun}.`}
                        getRowStatusColor={(row) => interventionStatusColor[row.status]}
                        onRowOpen={(row) => onOpenIntervention(row.id)}
                        isInitialLoading={interventions.isInitialLoading}
                        isRefetching={interventions.isRefetching}
                        loadError={interventions.error}
                        onRetry={() => void interventions.reload()}
                        skeletonRowCount={interventions.pageSize}
                    />
                </div>

                <TablePagination
                    currentPage={interventions.page}
                    totalPages={interventions.totalPages}
                    totalItems={interventions.totalItems}
                    pageSize={interventions.pageSize}
                    onPageChange={interventions.setPage}
                    onPageSizeChange={interventions.setPageSize}
                />
            </TabsContent>

            {contractsTab ? (
                <TabsContent value="contracts" aria-label={`Contratti del ${ownerNoun}`} className="min-h-0 flex-1">
                    {contractsTab.content}
                </TabsContent>
            ) : null}

            {devicesTab ? (
                <TabsContent value="devices" aria-label={`Dispositivi del ${ownerNoun}`} className="min-h-0 flex-1">
                    {devicesTab.content}
                </TabsContent>
            ) : null}
        </Tabs>
    );
};

export default ReportsInterventionsTabs;
