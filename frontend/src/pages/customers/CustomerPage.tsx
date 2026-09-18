import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import DetailItem from "@/components/detail-item";
import LoadingPage from "@/components/loadingPage";
import RefreshButton from "@/components/refresh-button";
import NotFoundState from "@/components/not-found-state";
import { useGoBack } from "@/hooks/useGoBack";
import { entityPaths } from "@/lib/entityPaths";
import PrintRangeDialog from "@/components/dialogs/printRangeDialog";
import CreateReportDialog, { type CreateReportSubmitValues } from "@/components/dialogs/create/createReportDialog";
import CreateInterventionDialog, {
    type CreateInterventionSubmitValues,
} from "@/components/dialogs/create/createInterventionDialog";
import DetailDeleteButton from "@/components/detail-delete-button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showCreatedToast } from "@/lib/createdToast";
import { resolveReportReferences, toReportCreatePayload } from "@/lib/reportForm";
import { toInterventionCreatePayload } from "@/lib/interventionForm";
import { resolveCustomerId } from "@/lib/customerLookup";
import CreateCustomerDialog, { type CustomerSubmitValues } from "@/components/dialogs/create/createCustomerDialog";
import { toCustomerPayload } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    createIntervention,
    createReport,
    deleteCustomer,
    getApiErrorMessage,
    getApiErrorStatus,
    getCustomer,
    getCustomerInterventionsPrintUrl,
    getCustomerReportsPrintUrl,
    getInterventionPrintUrl,
    getReportPrintUrl,
    updateCustomer,
} from "@/lib/api";
import { formatDateTime, openPrintWindow } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, HardHat, Pencil, Plus, Printer } from "lucide-react";
import type { CustomerDto } from "@/types/dtos";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
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
    const customerId = Number(id);
    const activeTab: ReportsInterventionsTab = location.pathname.endsWith("/interventions")
        ? "interventions"
        : "reports";

    const [isCustomerLoading, setIsCustomerLoading] = useState(true);
    const [customer, setCustomer] = useState<CustomerDto | null>(null);
    const customerName = customer ? formatPersonName(customer) : "Cliente";
    useDocumentTitle(activeTab === "interventions" ? `Interventi di ${customerName}` : customerName);

    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isCreateReportDialogOpen, setIsCreateReportDialogOpen] = useState(false);
    const [isCreateInterventionDialogOpen, setIsCreateInterventionDialogOpen] = useState(false);

    const hasValidCustomerId = useMemo(() => Number.isInteger(customerId) && customerId > 0, [customerId]);

    // Vedi lo stesso stato in `ReportPage`: un cliente che non esiste si mostra come tale.
    const [isNotFound, setIsNotFound] = useState(false);
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

    const loadCustomer = useCallback(async () => {
        try {
            setCustomer(await getCustomer(customerId));
        } catch (error) {
            if (getApiErrorStatus(error) === 404) {
                setIsNotFound(true);
                return;
            }

            toast.error(getApiErrorMessage(error, "Impossibile caricare il cliente"));
        }
    }, [customerId]);

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
    const handleCreateReport = async (values: CreateReportSubmitValues) => {
        const createdReport = await createReport(toReportCreatePayload(values, await resolveReportReferences(values)));

        await reloadReports();

        showCreatedToast({
            message: `Report #${createdReport.id} creato`,
            onOpen: () => navigate(entityPaths.report(createdReport.id)),
            onPrint: () => openPrintWindow(getReportPrintUrl(createdReport.id)),
        });
    };

    const handleCreateIntervention = async (values: CreateInterventionSubmitValues) => {
        const interventionCustomerId = await resolveCustomerId(values.customerId, values.customer);
        const createdIntervention = await createIntervention(
            toInterventionCreatePayload(values, interventionCustomerId)
        );

        await reloadInterventions();

        showCreatedToast({
            message: `Intervento #${createdIntervention.id} creato`,
            onOpen: () => navigate(entityPaths.intervention(createdIntervention.id)),
            onPrint: () => openPrintWindow(getInterventionPrintUrl(createdIntervention.id)),
        });
    };

    const handleRefresh = useCallback(async () => {
        await Promise.all([loadCustomer(), reloadReports(), reloadInterventions()]);
    }, [loadCustomer, reloadInterventions, reloadReports]);

    // Senza `navigate` fra le dipendenze: cambia identità a ogni cambio di indirizzo, e
    // cambiare tab cambia l'indirizzo, quindi ogni cambio di tab ricaricava il cliente e
    // copriva la pagina con lo spinner per un istante.
    useEffect(() => {
        if (!hasValidCustomerId) {
            return;
        }

        // I dati del cliente sono l'intestazione e il riquadro in alto: è l'unica cosa che si
        // aspetta prima di disegnare la pagina. Le liste si caricano da sole, con lo scheletro.
        void (async () => {
            setIsCustomerLoading(true);
            try {
                await loadCustomer();
            } finally {
                setIsCustomerLoading(false);
            }
        })();
    }, [hasValidCustomerId, loadCustomer]);

    if (!hasValidCustomerId || isNotFound) {
        return (
            <NotFoundState
                title="Cliente non trovato"
                description="Il cliente che cerchi non esiste, oppure è stato eliminato."
                backTo="/clients"
                backLabel="Vai ai clienti"
            />
        );
    }

    if (isCustomerLoading) {
        return <LoadingPage />;
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

            {/* Con sei azioni i pulsanti non stanno accanto al nome su un telefono: `flex-wrap`
                li manda sotto, allineati a destra, solo quando serve. */}
            <div className="flex flex-wrap items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon-lg" variant="ghost" onClick={handleBack} aria-label="Torna indietro">
                            <ArrowLeft className="size-6" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Torna indietro</TooltipContent>
                </Tooltip>
                <h1 className="min-w-0 text-2xl font-bold wrap-break-word">{customerName}</h1>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <RefreshButton
                        onRefresh={handleRefresh}
                        isRefreshing={lists.isLoading}
                        label="Aggiorna i dati del cliente"
                    />

                    {/* Un menu solo per le due creazioni: sono azioni sorelle, e due pulsanti in
                        più non starebbero nell'intestazione su un telefono. */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="lg" aria-label="Nuovo report o intervento">
                                <Plus className="size-5" />
                                <span className="hidden text-lg lg:inline">Nuovo</span>
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

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="lg"
                                onClick={() => setIsEditDialogOpen(true)}
                                aria-label="Modifica cliente"
                            >
                                <Pencil className="size-5" />
                                <span className="hidden text-lg lg:inline">Modifica</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifica cliente</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="lg" onClick={() => setIsPrintDialogOpen(true)} aria-label={printTitle}>
                                <Printer className="size-5" />
                                <span className="hidden text-lg lg:inline">Stampa</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{printTitle}</TooltipContent>
                    </Tooltip>

                    <DetailDeleteButton
                        label="Elimina cliente"
                        title="Elimina cliente"
                        description={`Sei sicuro di voler eliminare il cliente ${customerName}?`}
                        onDelete={() => deleteCustomer(customerId)}
                        successMessage="Cliente eliminato con successo"
                        errorMessage="Impossibile eliminare il cliente"
                        redirectTo="/clients"
                    />
                </div>
            </div>

            {customer ? (
                <Card className="gap-1">
                    <CardHeader>
                        <CardTitle className="text-primary">Dati del cliente</CardTitle>
                    </CardHeader>
                    {/* Due colonne anche su mobile: una voce per riga, la scheda occupava metà
                        schermo e alla tabella restava lo spazio di una riga. L'email, che può
                        essere lunga, prende la riga intera finché le colonne sono due. */}
                    <CardContent className="grid grid-cols-2 gap-2 xl:grid-cols-5">
                        <DetailItem label="Telefono" value={customer.phoneNumber ?? "-"} />
                        <DetailItem label="Telefono 2" value={customer.phoneNumberSecondary ?? "-"} />
                        <DetailItem label="Email" value={customer.email ?? "-"} className="col-span-2 xl:col-span-1" />
                        <DetailItem label="Località" value={customer.city ?? "-"} />
                        <DetailItem label="Cliente dal" value={formatDateTime(customer.createdAt)} />
                    </CardContent>
                </Card>
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
