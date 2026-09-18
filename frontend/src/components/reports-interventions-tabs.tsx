import EntityTable, { type EntityColumn } from "@/components/entity-table";
import FilterSelect from "@/components/filters/filter-select";
import OpenEntityButton from "@/components/open-entity-button";
import TablePagination from "@/components/table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReportsAndInterventionsLists } from "@/hooks/useReportsAndInterventionsOf";
import { entityPaths } from "@/lib/entityPaths";
import { interventionStatusColor, interventionStatusOptions } from "@/lib/interventions";
import { reportStatusColor, reportVisibilityOptions } from "@/lib/reports";
import type { InterventionDto, ReportDto } from "@/types/dtos";
import { ListFilter } from "lucide-react";

export type ReportsInterventionsTab = "reports" | "interventions";

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
};

/**
 * Le due tab delle schede di cliente e collaboratore, con il filtro sulla stessa riga e la tabella
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
}: ReportsInterventionsTabsProps) => {
    const { reports, interventions } = lists;

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
                </TabsList>
                {activeTab === "interventions" ? (
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
                        columns={reportColumns}
                        rows={reports.rows}
                        getRowKey={(row) => row.id}
                        emptyMessage={`Nessun report associato a questo ${ownerNoun}.`}
                        renderRowActions={(row) => (
                            <OpenEntityButton
                                size="icon-lg"
                                to={entityPaths.report(row.id)}
                                aria-label={`Apri report ${row.id}`}
                            />
                        )}
                        getRowStatusColor={(row) => reportStatusColor(row.closed)}
                        onRowOpen={(row) => onOpenReport(row.id)}
                        isInitialLoading={reports.isInitialLoading}
                        isRefetching={reports.isRefetching}
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
                        columns={interventionColumns}
                        rows={interventions.rows}
                        getRowKey={(row) => row.id}
                        emptyMessage={`Nessun intervento associato a questo ${ownerNoun}.`}
                        renderRowActions={(row) => (
                            <OpenEntityButton
                                size="icon-lg"
                                to={entityPaths.intervention(row.id)}
                                aria-label={`Apri intervento ${row.id}`}
                            />
                        )}
                        getRowStatusColor={(row) => interventionStatusColor[row.status]}
                        onRowOpen={(row) => onOpenIntervention(row.id)}
                        isInitialLoading={interventions.isInitialLoading}
                        isRefetching={interventions.isRefetching}
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
        </Tabs>
    );
};

export default ReportsInterventionsTabs;
