import ContractHoursBar from "@/components/contract-hours-bar";
import CustomerLink from "@/components/customer-link";
import DetailDeleteButton from "@/components/detail-delete-button";
import { DetailHeader, DetailHeaderAction } from "@/components/detail-header";
import DetailItem, { DetailGrid, DetailSection } from "@/components/detail-item";
import DetailStats, { DetailStatBadge } from "@/components/detail-stats";
import CreateContractDialog, { type ContractSubmitValues } from "@/components/dialogs/create/createContractDialog";
import EntityDetailGate from "@/components/entity-detail-gate";
import EntityTable from "@/components/entity-table";
import OpenEntityButton from "@/components/open-entity-button";
import RefreshButton from "@/components/refresh-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import { useGoBack } from "@/hooks/useGoBack";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePaginatedRows } from "@/hooks/usePaginatedRows";
import { deleteContract, getContract, getContractPrintUrl, listInterventions, updateContract } from "@/lib/api";
import { toContractUpdatePayload } from "@/lib/contractForm";
import {
    contractPrintName,
    contractStatusColor,
    formatAssistanceType,
    formatContractStatus,
    formatContractTerm,
    formatContractType,
    formatHours,
    hoursUsagePercent,
} from "@/lib/contracts";
import { entityPaths } from "@/lib/entityPaths";
import { interventionStatusColor } from "@/lib/interventions";
import { getMonthLabel } from "@/lib/monthKey";
import { cn, formatDate, formatDateTime, openPrintWindow } from "@/lib/utils";
import type { ContractDto, InterventionDto } from "@/types/dtos";
import { Pencil, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { customerInterventionColumns } from "../customers/components/customer-detail-columns";

/** Le righe dello storico mensile, dal mese più recente: il server le manda in ordine non garantito. */
const sortedMonthlyHours = (contract: ContractDto) =>
    [...(contract.monthlyHours ?? [])].sort((a, b) => b.month.localeCompare(a.month));

const ContractPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const {
        data: contract,
        isLoading,
        isReloading,
        isNotFound,
        reload,
    } = useEntityDetail(id, getContract, {
        backTo: "/contracts",
        errorMessage: "Impossibile caricare il contratto",
    });
    useDocumentTitle(contract ? `Contratto #${contract.id} - ${contract.customerName}` : "Contratto");
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const handleBack = useGoBack("/contracts");

    const contractId = contract?.id ?? null;
    const isAssistance = contract?.type === "assistance";

    // Gli interventi che hanno consumato le ore del contratto: li filtra il server (`contractId`).
    const interventions = usePaginatedRows<InterventionDto>({
        fetchRows: async (signal) => {
            if (!contract || !isAssistance) {
                return { items: [], totalItems: 0, page: 1, pageSize: 1, totalPages: 1 };
            }

            const response = await listInterventions({
                page: 1,
                pageSize: 1000,
                contractId: contract.id,
                sortBy: "interventionDate",
                sortOrder: "desc",
                signal,
            });
            return { ...response, totalPages: 1 };
        },
        queryKey: [contractId, isAssistance],
        errorMessage: "Impossibile caricare gli interventi del contratto",
        initialLoading: false,
    });
    const { reload: reloadInterventions } = interventions;

    const handleRefresh = async () => {
        await Promise.all([reload(), reloadInterventions()]);
    };

    const handleEditContract = async (values: ContractSubmitValues) => {
        if (!contract) {
            return;
        }

        await updateContract(contract.id, toContractUpdatePayload(values));
        // La PUT non restituisce le ore del mese né lo storico: si ricarica la scheda intera.
        await handleRefresh();
    };

    // Il caricamento a tutta pagina solo senza dati: sui ricaricamenti la scheda resta, attenuata.
    if (isNotFound || !contract) {
        return (
            <EntityDetailGate
                isNotFound={isNotFound}
                isLoading={isLoading}
                variant="contract"
                notFound={{
                    title: "Contratto non trovato",
                    description: "Il contratto che cerchi non esiste, oppure è stato eliminato.",
                    backTo: "/contracts",
                    backLabel: "Vai ai contratti",
                }}
                unavailableLabel="Contratto non disponibile."
            />
        );
    }

    const monthlyHours = sortedMonthlyHours(contract);
    const includedHours = contract.assistance?.includedHours ?? null;

    return (
        // Scorre il `main` del layout, come nella scheda dell'intervento.
        <div className="flex w-full flex-col gap-4 self-start">
            <DetailHeader
                onBack={handleBack}
                title={
                    <>
                        Contratto #{contract.id} -{" "}
                        <CustomerLink customerId={contract.customerId} name={contract.customerName} />
                    </>
                }
            >
                <RefreshButton onRefresh={handleRefresh} isRefreshing={isReloading} label="Aggiorna contratto" />

                <DetailHeaderAction
                    variant="outline"
                    icon={Pencil}
                    text="Modifica"
                    onClick={() => setIsEditDialogOpen(true)}
                    aria-label="Modifica contratto"
                />

                <DetailHeaderAction
                    variant="outline"
                    icon={Printer}
                    text="Stampa"
                    onClick={() => openPrintWindow(getContractPrintUrl(contract.id))}
                    aria-label={`Stampa ${contractPrintName(contract.effectiveStatus)}`}
                />

                <DetailDeleteButton
                    label="Elimina contratto"
                    title="Elimina contratto"
                    description={`Sei sicuro di voler eliminare il contratto ID ${contract.id}?`}
                    onDelete={() => deleteContract(contract.id)}
                    successMessage="Contratto eliminato con successo"
                    errorMessage="Impossibile eliminare il contratto"
                    redirectTo="/contracts"
                />
            </DetailHeader>

            {isEditDialogOpen ? (
                <CreateContractDialog
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    mode="edit"
                    initialValues={contract}
                    onSubmit={handleEditContract}
                />
            ) : null}

            {/* Attenuato durante un ricaricamento: vedi lo stesso blocco in `InterventionPage`. */}
            <div
                aria-busy={isReloading}
                className={cn("flex flex-col gap-4", isReloading && "opacity-60 transition-opacity")}
            >
                <DetailStats
                    items={[
                        {
                            label: "Stato",
                            value: (
                                <DetailStatBadge color={contractStatusColor(contract.effectiveStatus)}>
                                    {formatContractStatus(contract.effectiveStatus)}
                                </DetailStatBadge>
                            ),
                        },
                        { label: "Tipo", value: formatContractType(contract.type) },
                        { label: "Durata", value: formatContractTerm(contract.term) },
                        { label: "Data inizio", value: formatDate(contract.startDate) },
                        { label: "Data fine", value: formatDate(contract.endDate) },
                    ]}
                />

                <div className="grid gap-4 xl:grid-cols-2">
                    <DetailSection title="Anagrafica" className="self-start">
                        <DetailGrid layout="rows">
                            <DetailItem
                                label="Cliente"
                                value={<CustomerLink customerId={contract.customerId} name={contract.customerName} />}
                            />
                            <DetailItem
                                label="Fornitore"
                                value={
                                    <Link
                                        to={entityPaths.provider(contract.providerId)}
                                        className="text-primary-text underline-offset-4 hover:underline focus-visible:underline"
                                    >
                                        {contract.providerName}
                                    </Link>
                                }
                            />
                            <DetailItem label="Dispositivo" value={contract.device} />
                        </DetailGrid>
                    </DetailSection>

                    <DetailSection title="Dettagli">
                        <DetailGrid layout="rows">
                            {contract.assistance ? (
                                <>
                                    <DetailItem
                                        label="Pacchetto"
                                        value={formatAssistanceType(contract.assistance.assistanceType)}
                                    />
                                    <DetailItem
                                        label="Ore al mese"
                                        value={
                                            contract.assistance.includedHours == null
                                                ? "Ore illimitate"
                                                : formatHours(contract.assistance.includedHours)
                                        }
                                    />
                                </>
                            ) : null}
                            <DetailItem label="Note" value={contract.note ?? "-"} longText />
                            <DetailItem label="Creato il" value={formatDateTime(contract.createdAt)} />
                            <DetailItem
                                label="Ultimo aggiornamento"
                                value={contract.updatedAt ? formatDateTime(contract.updatedAt) : "-"}
                            />
                        </DetailGrid>
                    </DetailSection>
                </div>

                {isAssistance ? (
                    <>
                        <DetailSection title="Ore del mese">
                            {contract.hours ? (
                                <ContractHoursBar
                                    month={contract.hours.month}
                                    usedHours={contract.hours.usedHours}
                                    includedHours={contract.hours.includedHours}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground">Nessun dato sulle ore disponibile.</p>
                            )}
                        </DetailSection>

                        <DetailSection title="Storico mensile">
                            {monthlyHours.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nessuna ora consumata finora.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Mese</TableHead>
                                            <TableHead>Ore usate</TableHead>
                                            <TableHead>Ore incluse</TableHead>
                                            <TableHead>Utilizzo</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {monthlyHours.map((row) => {
                                            const percent = hoursUsagePercent(row.usedHours, includedHours);

                                            return (
                                                <TableRow key={row.month}>
                                                    <TableCell className="capitalize">
                                                        {getMonthLabel(row.month)}
                                                    </TableCell>
                                                    <TableCell>{formatHours(row.usedHours)}</TableCell>
                                                    <TableCell>
                                                        {includedHours == null
                                                            ? "Illimitate"
                                                            : formatHours(includedHours)}
                                                    </TableCell>
                                                    <TableCell
                                                        className={cn(
                                                            percent != null &&
                                                                percent > 100 &&
                                                                "font-medium text-destructive"
                                                        )}
                                                    >
                                                        {percent == null ? "-" : `${Math.round(percent)}%`}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </DetailSection>

                        <DetailSection title="Interventi collegati">
                            <EntityTable
                                tableKey="contract-interventions"
                                columns={customerInterventionColumns}
                                rows={interventions.rows}
                                getRowKey={(row) => row.id}
                                emptyMessage="Nessun intervento collegato a questo contratto."
                                loadError={interventions.error}
                                onRetry={() => void reloadInterventions()}
                                renderRowActions={(row) => (
                                    <OpenEntityButton
                                        size="icon-lg"
                                        to={entityPaths.intervention(row.id)}
                                        aria-label={`Apri intervento ${row.id}`}
                                    />
                                )}
                                getRowStatusColor={(row) => interventionStatusColor[row.status]}
                                onRowOpen={(row) => void navigate(entityPaths.intervention(row.id))}
                                isInitialLoading={interventions.isInitialLoading}
                                isRefetching={interventions.isRefetching}
                            />
                        </DetailSection>
                    </>
                ) : null}
            </div>
        </div>
    );
};

export default ContractPage;
