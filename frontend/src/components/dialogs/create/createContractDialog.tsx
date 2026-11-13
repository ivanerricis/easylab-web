import CustomDialog from "@/components/dialogs/customDialog";
import StepProgress from "@/components/dialogs/step-progress";
import DatePickerField from "@/components/date-picker-field";
import FormField from "@/components/form-field";
import InputWithAdd from "@/components/inputWithAdd";
import MonthsField from "@/components/months-field";
import SegmentedControl from "@/components/segmented-control";
import CreateCustomerDialog from "@/components/dialogs/create/createCustomerDialog";
import CreateProviderDialog from "@/components/dialogs/create/createProviderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    createCustomer,
    createProvider,
    getApiErrorField,
    getApiErrorMessage,
    listContractPackages,
    listCustomers,
    listProviders,
} from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";
import {
    contractEndDate,
    contractStatusOptions,
    contractTypeOptions,
    formatBillingPeriod,
    formatPackageHours,
    formatPackagePrice,
    formatPackagePriority,
    supportTermMonths,
} from "@/lib/contracts";
import {
    contractFieldOrder,
    emptyContractFormState,
    toContractSubmitValues,
    validateContractForm,
    type ContractFieldErrors,
    type ContractFormField,
    type ContractFormState,
} from "@/lib/contractForm";
import { resolveCustomerId } from "@/lib/customerLookup";
import { formatCustomerOption, toCustomerPayload } from "@/lib/customers";
import { fieldErrorAria, fieldProps, hasFormChanged, reportFieldErrors } from "@/lib/formField";
import { getTodayDateString } from "@/lib/interventions";
import { toProviderPayload } from "@/lib/providers";
import { formatDate } from "@/lib/utils";
import type {
    AssistancePackage,
    ContractDto,
    ContractPackageDto,
    ContractStatus,
    ContractType,
    CustomerDto,
} from "@/types/dtos";
import { Plus, Save } from "lucide-react";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** I valori che questo dialogo consegna a chi lo apre, con cliente e fornitore già risolti in id. */
export type ContractSubmitValues = {
    type: ContractType;
    status: ContractStatus;
    termMonths: number;
    /** Solo per il noleggio: ogni quanti mesi si fattura; `null` per l'assistenza. */
    billingMonths: number | null;
    device: string;
    note: string | null;
    startDate: string;
    customerId: number;
    providerId: number;
    /** Solo per l'assistenza: ore e prezzo li copia il server dal listino. */
    assistance: { package: AssistancePackage } | null;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: ContractSubmitValues) => Promise<void> | void;
    mode?: "create" | "edit";
    /** Il contratto da modificare. */
    initialValues?: ContractDto | null;
    /** Il cliente da cui si parte (dalla sua scheda): la casella è già compilata e resta modificabile. */
    initialCustomer?: CustomerDto | null;
};

const formatInitialCustomer = (customer: CustomerDto) =>
    formatCustomerOption(customer.firstName, customer.lastName, customer.phoneNumber, customer.phoneNumberSecondary);

/** Dal contratto ai campi del modulo: l'inverso di `toContractSubmitValues`. */
const toFormState = (contract: ContractDto): ContractFormState => ({
    type: contract.type,
    status: contract.status,
    termMonths: String(contract.termMonths),
    billingMonths: contract.billingMonths != null ? String(contract.billingMonths) : "3",
    device: contract.device,
    note: contract.note ?? "",
    startDate: contract.startDate,
    customer: contract.customerName,
    provider: contract.providerName,
    package: contract.assistance?.package ?? emptyContractFormState("").package,
});

const CreateContractDialog = ({
    open,
    onOpenChange,
    onSubmit,
    mode = "create",
    initialValues = null,
    initialCustomer = null,
}: Props) => {
    const [formValues, setFormValues] = useState<ContractFormState>(() => emptyContractFormState(""));
    const [initialFormValues, setInitialFormValues] = useState(formValues);
    const [errors, setErrors] = useState<ContractFieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Il listino dei pacchetti arriva dal server all'apertura: `packagesAttempt` serve a riprovare.
    const [packages, setPackages] = useState<ContractPackageDto[]>([]);
    const [packagesStatus, setPackagesStatus] = useState<"loading" | "ready" | "error">("loading");
    const [packagesAttempt, setPackagesAttempt] = useState(0);
    // Etichetta della casella -> id, per i valori scelti dai suggerimenti (e per quelli di partenza):
    // vedi lo stesso meccanismo in `CreateInterventionDialog`.
    const [customerIdByOption, setCustomerIdByOption] = useState<Record<string, number>>({});
    const [providerIdByOption, setProviderIdByOption] = useState<Record<string, number>>({});
    // I dialoghi annidati per creare al volo un cliente o un fornitore, come in `CreateInterventionDialog`.
    const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
    const [isCreateProviderDialogOpen, setIsCreateProviderDialogOpen] = useState(false);
    const isDirty = hasFormChanged(formValues, initialFormValues);
    const isEdit = mode === "edit";
    // Sotto `sm` il modulo diventa a passi, come il report e l'intervento; da `sm` in su è una colonna sola.
    const isStepped = useIsMobile(640);
    const [step, setStep] = useState(0);
    const pendingFocusRef = useRef<ContractFormField | null>(null);
    const contractSteps: { title: string; fields: readonly ContractFormField[] }[] = [
        { title: "Parti", fields: ["customer", "provider", "device"] },
        { title: "Condizioni", fields: ["termMonths", "billingMonths", "startDate"] },
        { title: formValues.type === "assistance" ? "Pacchetto" : "Note", fields: ["package"] },
        { title: "Riepilogo", fields: [] },
    ];
    const isLastStep = !isStepped || step === contractSteps.length - 1;

    useEffect(() => {
        if (!open) {
            return;
        }

        startTransition(() => {
            const nextFormValues = initialValues
                ? toFormState(initialValues)
                : emptyContractFormState(
                      getTodayDateString(),
                      initialCustomer ? formatInitialCustomer(initialCustomer) : ""
                  );

            setErrors({});
            setStep(0);
            setFormValues(nextFormValues);
            setInitialFormValues(nextFormValues);
            setCustomerIdByOption(
                initialValues
                    ? { [initialValues.customerName]: initialValues.customerId }
                    : initialCustomer
                      ? { [formatInitialCustomer(initialCustomer)]: initialCustomer.id }
                      : {}
            );
            setProviderIdByOption(initialValues ? { [initialValues.providerName]: initialValues.providerId } : {});
        });
    }, [open, initialValues, initialCustomer]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const controller = new AbortController();

        startTransition(() => setPackagesStatus("loading"));

        listContractPackages(controller.signal)
            .then((items) => {
                setPackages(items);
                setPackagesStatus("ready");
            })
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }

                setPackagesStatus("error");
                toast.error(getApiErrorMessage(error, "Impossibile caricare i pacchetti di assistenza"));
            });

        return () => controller.abort();
    }, [open, packagesAttempt]);

    /** Applica i campi cambiati e toglie l'errore a quelli toccati. */
    const handleChange = (patch: Partial<ContractFormState>) => {
        setFormValues((prev) => ({ ...prev, ...patch }));
        setErrors((prev) => {
            const next = { ...prev };
            for (const field of Object.keys(patch)) {
                delete next[field as keyof ContractFieldErrors];
            }
            return next;
        });
    };

    const selectedPackage = packages.find((item) => item.key === formValues.package) ?? null;
    // Il Supporto dura sempre 12 mesi: si imposta e si blocca la durata (tornando a un pacchetto mensile si sblocca).
    const isSupportPackage = formValues.type === "assistance" && selectedPackage?.period === "contract";

    const handlePackageChange = (key: AssistancePackage) =>
        handleChange({
            package: key,
            ...(packages.find((item) => item.key === key)?.period === "contract"
                ? { termMonths: String(supportTermMonths) }
                : {}),
        });

    const searchCustomers = useCallback(async (query: string, signal: AbortSignal) => {
        const customers = await listCustomers({ pageSize: 8, search: query || undefined, signal });
        const options = customers.items.map((customer) => ({
            id: customer.id,
            label: formatInitialCustomer(customer),
        }));

        setCustomerIdByOption((prev) => ({
            ...prev,
            ...Object.fromEntries(options.map((item) => [item.label, item.id])),
        }));

        return options.map((item) => item.label);
    }, []);

    const searchProviders = useCallback(async (query: string, signal: AbortSignal) => {
        const providers = await listProviders({ pageSize: 8, search: query || undefined, signal });

        setProviderIdByOption((prev) => ({
            ...prev,
            ...Object.fromEntries(providers.items.map((provider) => [provider.providerName, provider.id])),
        }));

        return providers.items.map((provider) => provider.providerName);
    }, []);

    /**
     * L'id del fornitore scritto nella casella: quello dei suggerimenti, altrimenti una ricerca sul
     * server con il nome esatto (maiuscole a parte). Come per il cliente, un testo che non
     * corrisponde a nessuno non si indovina.
     */
    const resolveProviderId = async (label: string) => {
        const knownId = providerIdByOption[label];

        if (knownId != null) {
            return knownId;
        }

        const { items } = await listProviders({ page: 1, pageSize: 1000, search: label });
        const matches = items.filter((provider) => provider.providerName.toLowerCase() === label.trim().toLowerCase());

        if (matches.length !== 1) {
            throw new Error(
                matches.length === 0
                    ? "Seleziona un fornitore esistente."
                    : "Più fornitori hanno questo nome: sceglilo dai suggerimenti."
            );
        }

        return matches[0].id;
    };

    /** I campi di un passo, per controllare solo quelli quando si preme "Avanti" (vedi `contractSteps`). */
    const stepOfField = (field: ContractFormField) => contractSteps.findIndex((item) => item.fields.includes(field));

    // Il campo da mettere a fuoco quando il passo che lo contiene sarà montato: con un errore in un
    // passo precedente, "Salva" torna lì, e il campo esiste solo dopo il render.
    const focusField = (field: ContractFormField) => {
        const fieldStep = stepOfField(field);

        if (isStepped && fieldStep !== step) {
            pendingFocusRef.current = field;
            setStep(fieldStep);
            return;
        }

        document.getElementById(field)?.focus();
    };

    useEffect(() => {
        if (pendingFocusRef.current) {
            document.getElementById(pendingFocusRef.current)?.focus();
            pendingFocusRef.current = null;
        }
    }, [step]);

    const handleConfirm = async () => {
        if (isSubmitting) {
            return;
        }

        // Tutti gli errori in un colpo solo, ciascuno accanto al proprio campo.
        const nextErrors: ContractFieldErrors = validateContractForm(formValues, { isSupportPackage });

        // A metà del percorso a passi si controllano solo i campi del passo visibile: segnalare come
        // sbagliato un campo che non si è ancora visto non servirebbe a niente.
        if (!isLastStep) {
            const stepErrors: ContractFieldErrors = {};

            for (const field of contractSteps[step].fields) {
                stepErrors[field] = nextErrors[field];
            }

            if (reportFieldErrors(stepErrors, contractFieldOrder, setErrors, focusField)) {
                return;
            }

            setStep(step + 1);
            return;
        }

        let customerId: number | null = null;
        let providerId: number | null = null;

        // Cliente e fornitore si risolvono solo se il testo c'è: quello vuoto ha già il suo errore.
        if (!nextErrors.customer) {
            try {
                customerId = await resolveCustomerId(
                    customerIdByOption[formValues.customer] ?? null,
                    formValues.customer
                );
            } catch (error) {
                nextErrors.customer = getApiErrorMessage(error, "Impossibile verificare il cliente");
            }
        }

        if (!nextErrors.provider) {
            try {
                providerId = await resolveProviderId(formValues.provider);
            } catch (error) {
                nextErrors.provider = getApiErrorMessage(error, "Impossibile verificare il fornitore");
            }
        }

        if (
            reportFieldErrors(nextErrors, contractFieldOrder, setErrors, focusField) ||
            customerId == null ||
            providerId == null
        ) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit(toContractSubmitValues(formValues, customerId, providerId));
            onOpenChange(false);
            toast.success(isEdit ? "Contratto aggiornato con successo" : "Contratto creato con successo");
        } catch (error) {
            // Il rifiuto della durata (il Supporto vuole 12 mesi) sta sotto il suo campo, non in un toast.
            if (getApiErrorField(error) === "termMonths") {
                reportFieldErrors(
                    { termMonths: getApiErrorMessage(error, "Durata non valida") },
                    contractFieldOrder,
                    setErrors,
                    focusField
                );
            } else {
                toast.error(getApiErrorMessage(error, "Impossibile salvare il contratto"));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const isAssistance = formValues.type === "assistance";
    const isDraft = formValues.status === "draft";
    const endDate = contractEndDate(formValues.startDate, Number(formValues.termMonths));
    const documentLabel = isDraft ? "Preventivo" : "Contratto";

    // I campi sono gli stessi a tutte le larghezze: cambia solo come si dispongono. Da `sm` in su
    // stanno tutti in una colonna (il tipo per primo, che decide cosa compare dopo); sotto `sm` si
    // procede a passi, come il report e l'intervento, con un riepilogo da rileggere prima di salvare.
    const typeField = (
        <FormField id="type" label="Tipo" className="gap-1">
            {/* Il tipo non si cambia dopo la creazione: il server lo rifiuta, e i dati del pacchetto di
            un'assistenza non avrebbero dove andare in un noleggio. */}
            <SegmentedControl
                id="type"
                aria-label="Tipo"
                value={formValues.type}
                options={contractTypeOptions}
                disabled={isEdit}
                onChange={(type) => handleChange({ type })}
                className="w-full"
            />
            {isEdit ? <p className="text-xs text-muted-foreground">Il tipo non si cambia dopo la creazione.</p> : null}
        </FormField>
    );

    const customerField = (
        <FormField id="customer" label="Cliente" className="gap-1" required error={errors.customer}>
            <div className="flex">
                <InputWithAdd
                    id="customer"
                    {...fieldErrorAria("customer", errors.customer)}
                    placeholder="Cliente"
                    inputClassName="rounded-r-none"
                    value={formValues.customer}
                    onSearch={searchCustomers}
                    isSelectedOption={customerIdByOption[formValues.customer] != null}
                    onChange={(customer) => handleChange({ customer })}
                    required
                />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-lg"
                            className="rounded-l-none border-l-0!"
                            onClick={() => setIsCreateCustomerDialogOpen(true)}
                            aria-label="Crea nuovo cliente"
                        >
                            <Plus className="size-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Crea nuovo cliente</TooltipContent>
                </Tooltip>
            </div>
        </FormField>
    );

    const providerField = (
        <FormField id="provider" label="Fornitore" className="gap-1" required error={errors.provider}>
            <div className="flex">
                <InputWithAdd
                    id="provider"
                    {...fieldErrorAria("provider", errors.provider)}
                    placeholder="Fornitore"
                    inputClassName="rounded-r-none"
                    value={formValues.provider}
                    onSearch={searchProviders}
                    isSelectedOption={providerIdByOption[formValues.provider] != null}
                    onChange={(provider) => handleChange({ provider })}
                    required
                />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-lg"
                            className="rounded-l-none border-l-0!"
                            onClick={() => setIsCreateProviderDialogOpen(true)}
                            aria-label="Crea nuovo fornitore"
                        >
                            <Plus className="size-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Crea nuovo fornitore</TooltipContent>
                </Tooltip>
            </div>
        </FormField>
    );

    const deviceField = (
        <FormField id="device" label="Dispositivo" className="gap-1" required error={errors.device}>
            <Input
                {...fieldProps("device", { error: errors.device, required: true })}
                autoComplete="off"
                placeholder="Es. Server HP ProLiant"
                value={formValues.device}
                onChange={(event) => handleChange({ device: event.target.value })}
            />
        </FormField>
    );

    const assistanceFields = isAssistance ? (
        <FormField
            id="package"
            label="Pacchetto"
            className="gap-1"
            error={errors.package}
            description={
                selectedPackage ? (
                    <span className="grid gap-0.5">
                        <span>
                            {formatPackageHours(selectedPackage)} · {formatPackagePrice(selectedPackage)}
                        </span>
                        <span>Priorità d&apos;intervento: {formatPackagePriority(selectedPackage.priority)}</span>
                        <span>{selectedPackage.typology}</span>
                    </span>
                ) : packagesStatus === "loading" ? (
                    "Caricamento dei pacchetti..."
                ) : null
            }
        >
            {packagesStatus === "error" ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-destructive">Impossibile caricare i pacchetti.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPackagesAttempt((n) => n + 1)}>
                        Riprova
                    </Button>
                </div>
            ) : (
                <Select
                    value={selectedPackage ? formValues.package : ""}
                    // Radix può richiamare `onValueChange("")` quando valore e voci cambiano insieme (apertura in
                    // modifica, listino appena arrivato): un valore vuoto non è una scelta.
                    onValueChange={(value) => value && handlePackageChange(value as AssistancePackage)}
                    disabled={packagesStatus === "loading"}
                >
                    <SelectTrigger id="package" {...fieldErrorAria("package", errors.package)} className="w-full">
                        <SelectValue
                            placeholder={packagesStatus === "loading" ? "Caricamento..." : "Seleziona pacchetto"}
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {packages.map((item) => (
                            <SelectItem key={item.key} value={item.key}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </FormField>
    ) : null;

    const startDateField = (
        <FormField id="startDate" label="Data inizio" className="gap-1" required error={errors.startDate}>
            <DatePickerField
                id="startDate"
                {...fieldErrorAria("startDate", errors.startDate)}
                value={formValues.startDate}
                onValueChange={(startDate) => handleChange({ startDate })}
            />
        </FormField>
    );

    const statusField = (
        <FormField id="status" label="Stato" className="gap-1">
            <Select
                value={formValues.status}
                onValueChange={(status) => handleChange({ status: status as ContractStatus })}
            >
                <SelectTrigger id="status" className="w-full">
                    <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                    {contractStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </FormField>
    );

    const termField = (
        <MonthsField
            id="termMonths"
            label="Durata"
            className="gap-1"
            value={formValues.termMonths}
            onChange={(termMonths) => handleChange({ termMonths })}
            error={errors.termMonths}
            disabled={isSupportPackage}
            description={isSupportPackage ? "Il Supporto dura sempre 12 mesi" : undefined}
        />
    );

    const billingField =
        formValues.type === "rental" ? (
            <MonthsField
                id="billingMonths"
                label="Periodo di fatturazione"
                className="gap-1"
                value={formValues.billingMonths}
                onChange={(billingMonths) => handleChange({ billingMonths })}
                error={errors.billingMonths}
            />
        ) : null;

    const noteField = (
        <FormField id="note" label="Note" className="gap-1">
            <Textarea
                id="note"
                className="resize-none"
                rows={3}
                placeholder="Annotazioni libere sul contratto"
                value={formValues.note}
                onChange={(event) => handleChange({ note: event.target.value })}
            />
        </FormField>
    );

    /** La fine e il tipo di documento che ne uscirà, mentre si compila: prima non si vedevano fino al salvataggio. */
    const periodSummary = (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-base">
            <span>
                Scade il <strong className="font-semibold">{endDate ? formatDate(endDate) : "-"}</strong>
            </span>
            <span className="text-muted-foreground">{isDraft ? "Preventivo (bozza)" : "Contratto"}</span>
        </div>
    );

    const draftHint = (
        <p className="text-sm text-muted-foreground">
            {isDraft
                ? "Da bozza il PDF è un preventivo: passa a Attivo quando il cliente accetta."
                : "Il PDF è un contratto. Con stato Bozza diventa un preventivo."}
        </p>
    );

    /** L'ultimo passo su telefono: tutto quello che si sta per salvare, da rileggere. */
    const summaryRows: { label: string; value: string }[] = [
        {
            label: "Documento",
            value: `${documentLabel} · ${contractStatusOptions.find((o) => o.value === formValues.status)?.label ?? ""}`,
        },
        { label: "Cliente", value: formValues.customer || "-" },
        { label: "Fornitore", value: formValues.provider || "-" },
        {
            label: "Tipo e dispositivo",
            value: `${contractTypeOptions.find((o) => o.value === formValues.type)?.label ?? ""} · ${formValues.device.trim() || "-"}`,
        },
        {
            label: "Periodo",
            value: endDate ? `${formatDate(formValues.startDate)} → ${formatDate(endDate)}` : "-",
        },
        ...(formValues.type === "rental"
            ? [{ label: "Fatturazione", value: formatBillingPeriod(Number(formValues.billingMonths)) }]
            : []),
        ...(isAssistance
            ? [
                  {
                      label: "Pacchetto",
                      value: selectedPackage
                          ? `${selectedPackage.name}, ${formatPackageHours(selectedPackage)}, ${formatPackagePrice(selectedPackage)}`
                          : "-",
                  },
                  ...(selectedPackage
                      ? [
                            {
                                label: "Priorità d'intervento",
                                value: formatPackagePriority(selectedPackage.priority),
                            },
                        ]
                      : []),
              ]
            : []),
        { label: "Note", value: formValues.note.trim() || "-" },
    ];

    const summary = (
        <div className="grid gap-3">
            <dl className="grid gap-3">
                {summaryRows.map((row) => (
                    <div key={row.label} className="grid gap-0.5 border-b pb-2 last:border-b-0">
                        <dt className="text-sm text-muted-foreground">{row.label}</dt>
                        <dd className="text-base font-medium break-words">{row.value}</dd>
                    </div>
                ))}
            </dl>
            {draftHint}
        </div>
    );

    return (
        <>
            <CustomDialog
                open={open}
                onOpenChange={onOpenChange}
                isDirty={isDirty}
                title={isEdit && initialValues ? `Modifica contratto #${initialValues.id}` : "Nuovo contratto"}
                description={
                    isEdit
                        ? "Aggiorna i dati del contratto e conferma per salvare."
                        : "Inserisci i dati del contratto e conferma per salvare."
                }
                // Sotto `sm`, dove si procede a passi, il dialogo è ancorato in alto e ha un'altezza fissa
                // (come l'intervento): i campi scorrono dentro e i pulsanti restano fermi in fondo.
                contentClassName="max-sm:top-4 max-sm:h-[min(44rem,calc(100dvh-2rem))] max-sm:translate-y-0 sm:max-w-xl"
                confirmLabel={isLastStep ? (isSubmitting ? "Salvataggio..." : "Salva") : "Avanti"}
                confirmIcon={isLastStep ? Save : undefined}
                cancelLabel={isStepped && step > 0 ? "Indietro" : "Annulla"}
                onCancel={() => (isStepped && step > 0 ? setStep(step - 1) : onOpenChange(false))}
                onConfirm={() => void handleConfirm()}
                cancelDisabled={isSubmitting}
                // Senza listino un contratto di assistenza partirebbe col pacchetto predefinito senza
                // che nessuno l'abbia scelto: si salva solo quando i pacchetti sono arrivati.
                confirmDisabled={
                    isSubmitting || (isLastStep && formValues.type === "assistance" && packagesStatus !== "ready")
                }
                content={
                    // Niente scroll proprio, né un'altezza massima calcolata a mano: a scorrere è il
                    // corpo di `CustomDialog`, l'unico, dentro un dialogo alto al massimo lo schermo.
                    <div className="grid content-start gap-4 max-sm:min-h-0 max-sm:flex-1">
                        {isStepped ? (
                            <>
                                <StepProgress steps={contractSteps.map((item) => item.title)} current={step} />
                                {step === 0 ? (
                                    <>
                                        {typeField}
                                        {customerField}
                                        {providerField}
                                        {deviceField}
                                    </>
                                ) : null}
                                {step === 1 ? (
                                    <>
                                        {termField}
                                        {billingField}
                                        {startDateField}
                                        {statusField}
                                        {periodSummary}
                                    </>
                                ) : null}
                                {step === 2 ? (
                                    <>
                                        {assistanceFields}
                                        {noteField}
                                    </>
                                ) : null}
                                {step === 3 ? summary : null}
                            </>
                        ) : (
                            <>
                                {typeField}
                                {customerField}
                                {providerField}
                                {deviceField}
                                {assistanceFields}
                                <div className="grid items-start gap-4 sm:grid-cols-2">
                                    {startDateField}
                                    {statusField}
                                </div>
                                {termField}
                                {billingField}
                                {periodSummary}
                                {noteField}
                                {draftHint}
                            </>
                        )}
                    </div>
                }
            />

            {/* Il cliente o il fornitore appena creato è già risolto: lo si registra con la stessa etichetta
            dei suggerimenti (`formatInitialCustomer`), così vale come scelto dall'elenco e al
            salvataggio non serve nessuna ricerca. */}
            <CreateCustomerDialog
                open={isCreateCustomerDialogOpen}
                onOpenChange={setIsCreateCustomerDialogOpen}
                onSubmit={async (values) => {
                    const createdCustomer = await createCustomer(toCustomerPayload(values));
                    const customerOption = formatInitialCustomer(createdCustomer);

                    setCustomerIdByOption((prev) => ({ ...prev, [customerOption]: createdCustomer.id }));
                    handleChange({ customer: customerOption });
                }}
            />

            <CreateProviderDialog
                open={isCreateProviderDialogOpen}
                onOpenChange={setIsCreateProviderDialogOpen}
                onSubmit={async (values) => {
                    const createdProvider = await createProvider(toProviderPayload(values));

                    setProviderIdByOption((prev) => ({ ...prev, [createdProvider.providerName]: createdProvider.id }));
                    handleChange({ provider: createdProvider.providerName });
                }}
            />
        </>
    );
};

export default CreateContractDialog;
