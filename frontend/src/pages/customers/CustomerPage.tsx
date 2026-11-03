import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailStats from "@/components/detail-stats";
import { DetailHeader, DetailHeaderAction } from "@/components/detail-header";
import EntityDetailGate from "@/components/entity-detail-gate";
import RefreshButton from "@/components/refresh-button";
import { useGoBack } from "@/hooks/useGoBack";
import { useEntityDetail } from "@/hooks/useEntityDetail";
import { entityPaths } from "@/lib/entityPaths";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import CreateReportDialog from "@/components/dialogs/create/createReportDialog";
import CreateInterventionDialog from "@/components/dialogs/create/createInterventionDialog";
import DetailDeleteButton from "@/components/detail-delete-button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateInterventionFlow, useCreateReportFlow } from "@/hooks/useCreateEntityFlow";
import CreateCustomerDialog, { type CustomerSubmitValues } from "@/components/dialogs/create/createCustomerDialog";
import { toCustomerPayload } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import {
    deleteCustomer,
    getCustomer,
    getCustomerInterventionsPrintUrl,
    getCustomerReportsPrintUrl,
    updateCustomer,
} from "@/lib/api";
import { formatDateTime, openPrintWindow } from "@/lib/utils";
import { useCallback, useState } from "react";
import { ClipboardList, HardHat, Pencil, Plus, Printer } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { customerInterventionColumns, customerReportColumns } from "./components/customer-detail-columns";
import ReportsInterventionsTabs, { type ReportsInterventionsTab } from "@/components/reports-interventions-tabs";
import { useReportsAndInterventionsOf } from "@/hooks/useReportsAndInterventionsOf";
import { formatPersonName } from "@/lib/people";

/**
 * La scheda del cliente: i suoi dati, i suoi report e i suoi interventi.
 *
 * Ha la stessa forma della scheda del collaboratore — intestazione, due tab, `EntityTable`
 * con filtro a destra e impaginazione in fondo — più il riquadro con i dati di contatto, che
 * prima non c'era: per sapere il telefono del cliente di cui si stava guardando la scheda
 * bisognava tornare all'elenco clienti.
 *
 * Prima i report e gli interventi erano due pagine distinte, ciascuna con una tabella di tre
 * o quattro colonne, un'etichetta e un filtro rientrati di 48px rispetto al resto. Ora sono
 * due tab della stessa pagina, e l'indirizzo segue il tab: `/clients/:id` apre i report,
 * `/clients/:id/interventions` gli interventi. Così i due pulsanti dell'elenco clienti e i
 * collegamenti già salvati continuano a portare dove portavano, e ricaricare la pagina non fa
 * perdere il tab.
 *
 * Filtro e impaginazione sono del server: l'elenco completo senza paginazione si ferma a 5000
 * righe, e sul database di sviluppo un cliente con cinque report risultava non averne.
 */
const CustomerPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    // Serve anche a chi non aspetta il cliente (i filtri delle due liste, sotto): loro non
    // sanno cosa farsene di un id non valido, ma in quel caso la pagina mostra comunque
    // "non trovato" prima di arrivare a renderizzarle.
    const customerId = Number(id);
    const activeTab: ReportsInterventionsTab = location.pathname.endsWith("/interventions")
        ? "interventions"
        : "reports";

    const {
        data: customer,
        isLoading: isCustomerLoading,
        isReloading: isCustomerReloading,
        isNotFound,
        reload: reloadCustomer,
        setData: setCustomer,
    } = useEntityDetail(id, getCustomer, {
        backTo: "/clients",
        errorMessage: "Impossibile caricare il cliente",
    });
    const customerName = customer ? formatPersonName(customer) : "Cliente";
    useDocumentTitle(activeTab === "interventions" ? `Interventi di ${customerName}` : customerName);

    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    // Solo su telefono: la card dei dati parte chiusa, con nome e telefono (vedi sotto).
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isCreateReportDialogOpen, setIsCreateReportDialogOpen] = useState(false);
    const [isCreateInterventionDialogOpen, setIsCreateInterventionDialogOpen] = useState(false);

    const handleBack = useGoBack("/clients");

    const handleTabChange = (value: ReportsInterventionsTab) => {
        navigate(value === "interventions" ? `/clients/${customerId}/interventions` : `/clients/${customerId}`, {
            replace: true,
        });
    };

    // La stampa segue il tab: dal tab dei report stampa il resoconto dei report, dall'altro
    // quello degli interventi. Prima ognuna delle due pagine aveva il suo pulsante.
    const printTitle = activeTab === "interventions" ? "Stampa resoconto interventi" : "Stampa resoconto report";

    const handleConfirmPrint = (range: { dateFrom?: string; dateTo?: string }) => {
        openPrintWindow(
            activeTab === "interventions"
                ? getCustomerInterventionsPrintUrl(customerId, range)
                : getCustomerReportsPrintUrl(customerId, range)
        );
    };

    const handleOpenReport = (reportId: number) => {
        navigate(entityPaths.report(reportId));
    };

    const handleOpenIntervention = (interventionId: number) => {
        navigate(entityPaths.intervention(interventionId));
    };

    const lists = useReportsAndInterventionsOf({
        owner: { customerId },
        tableKeyPrefix: "customer",
        ownerLabel: "del cliente",
    });
    const { reload: reloadReports } = lists.reports;
    const { reload: reloadInterventions } = lists.interventions;

    // Prima i dati si potevano cambiare solo dall'elenco clienti: dalla scheda bisognava
    // tornare indietro, ritrovare il cliente e aprire lì il dialogo. Il nome nell'intestazione
    // e il riquadro si aggiornano con il cliente che il server restituisce.
    const handleEditCustomer = async (values: CustomerSubmitValues) => {
        setCustomer(await updateCustomer(customerId, toCustomerPayload(values)));
    };

    // Report e intervento nuovi partono da questo cliente (vedi `initialCustomer` nei due
    // dialoghi): prima bisognava aprire il dialogo altrove e ricercarlo. Il resto è come
    // nell'elenco: niente try/catch, l'errore lo mostra il dialogo; dopo si ricarica la lista
    // e l'avviso offre di aprire o stampare.
    const handleCreateReport = useCreateReportFlow(reloadReports);
    const handleCreateIntervention = useCreateInterventionFlow(reloadInterventions);

    const handleRefresh = useCallback(async () => {
        await Promise.all([reloadCustomer(), reloadReports(), reloadInterventions()]);
    }, [reloadCustomer, reloadInterventions, reloadReports]);

    // Il caricamento a tutta pagina solo senza dati: su "Aggiorna" la scheda resta, con la card
    // dei dati attenuata (`isBusy`), invece di sparire e ricomparire. Vedi `ReportPage`.
    if (isNotFound || (isCustomerLoading && !customer)) {
        return (
            <EntityDetailGate
                isNotFound={isNotFound}
                isLoading={isCustomerLoading}
                notFound={{
                    title: "Cliente non trovato",
                    description: "Il cliente che cerchi non esiste, oppure è stato eliminato.",
                    backTo: "/clients",
                    backLabel: "Vai ai clienti",
                }}
                variant="customer"
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-4">
            <PrintRangeDialog
                open={isPrintDialogOpen}
                onOpenChange={setIsPrintDialogOpen}
                title={printTitle}
                onConfirm={handleConfirmPrint}
            />

            <CreateReportDialog
                open={isCreateReportDialogOpen}
                onOpenChange={setIsCreateReportDialogOpen}
                onSubmit={handleCreateReport}
                initialCustomer={customer}
            />

            <CreateInterventionDialog
                open={isCreateInterventionDialogOpen}
                onOpenChange={setIsCreateInterventionDialogOpen}
                onSubmit={handleCreateIntervention}
                initialCustomer={customer}
            />

            {isEditDialogOpen && customer ? (
                <CreateCustomerDialog
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    mode="edit"
                    initialValues={customer}
                    onSubmit={handleEditCustomer}
                />
            ) : null}

            <DetailHeader onBack={handleBack} title={customerName} hideTitleOnMobile>
                <RefreshButton
                    onRefresh={handleRefresh}
                    isRefreshing={lists.isLoading || isCustomerReloading}
                    label="Aggiorna i dati del cliente"
                />

                {/* Un menu solo per le due creazioni: sono azioni sorelle, e due pulsanti in
                    più non starebbero nell'intestazione su un telefono. */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="lg" aria-label="Nuovo report o intervento">
                            <Plus className="size-5" />
                            {/* A 14px come le altre azioni dell'intestazione: vedi `DetailHeaderAction`. */}
                            <span className="hidden lg:inline">Nuovo</span>
                        </Button>
                    </DropdownMenuTrigger>
                    {/* Largo quanto le voci, non quanto il pulsante: da solo prende la larghezza
                        del trigger, che su mobile è un'icona. */}
                    <DropdownMenuContent align="end" className="w-auto">
                        <DropdownMenuItem onSelect={() => setIsCreateReportDialogOpen(true)}>
                            <ClipboardList />
                            Nuovo report
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setIsCreateInterventionDialogOpen(true)}>
                            <HardHat />
                            Nuovo intervento
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <DetailHeaderAction
                    variant="outline"
                    icon={Pencil}
                    text="Modifica"
                    onClick={() => setIsEditDialogOpen(true)}
                    aria-label="Modifica cliente"
                />

                <DetailHeaderAction
                    icon={Printer}
                    text="Stampa"
                    onClick={() => setIsPrintDialogOpen(true)}
                    aria-label={printTitle}
                />

                <DetailDeleteButton
                    label="Elimina cliente"
                    title="Elimina cliente"
                    description={`Sei sicuro di voler eliminare il cliente ${customerName}?`}
                    onDelete={() => deleteCustomer(customerId)}
                    successMessage="Cliente eliminato con successo"
                    errorMessage="Impossibile eliminare il cliente"
                    redirectTo="/clients"
                />
            </DetailHeader>

            {customer ? (
                // Le stesse card dei numeri in cima alla scheda report: qui sono i dati del cliente.
                // Sotto `sm` diventano una card sola con il nome come titolo (vedi `DetailStats`).
                <DetailStats
                    mobileTitle={customerName}
                    gridClassName="xl:grid-cols-4"
                    items={[
                        {
                            // I due numeri uno sotto l'altro: recuperano la larghezza di una card,
                            // che va all'email (l'indirizzo lungo non va più a capo).
                            label: "Telefono",
                            value: (
                                <>
                                    <span className="block">{customer.phoneNumber ?? "-"}</span>
                                    {customer.phoneNumberSecondary ? (
                                        <span className="block">{customer.phoneNumberSecondary}</span>
                                    ) : null}
                                </>
                            ),
                        },
                        // `break-all`: un indirizzo lungo non ha punti dove andare a capo e usciva dalla card.
                        { label: "Email", value: <span className="break-all">{customer.email ?? "-"}</span> },
                        { label: "Località", value: customer.city ?? "-" },
                        { label: "Cliente dal", value: formatDateTime(customer.createdAt) },
                    ]}
                />
            ) : null}

            <ReportsInterventionsTabs
                activeTab={activeTab}
                onTabChange={handleTabChange}
                lists={lists}
                reportColumns={customerReportColumns}
                interventionColumns={customerInterventionColumns}
                tableKeyPrefix="customer"
                ownerNoun="cliente"
                onOpenReport={handleOpenReport}
                onOpenIntervention={handleOpenIntervention}
            />
        </div>
    );
};

export default CustomerPage;
