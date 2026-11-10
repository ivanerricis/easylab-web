import CustomDialog from "@/components/dialogs/customDialog";
import DatePickerField from "@/components/date-picker-field";
import FormField from "@/components/form-field";
import FormSection from "@/components/dialogs/form-section";
import InputWithAdd from "@/components/inputWithAdd";
import MonthsField from "@/components/months-field";
import CreateCustomerDialog from "@/components/dialogs/create/createCustomerDialog";
import CreateProviderDialog from "@/components/dialogs/create/createProviderDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createCustomer, createProvider, getApiErrorMessage, listCustomers, listProviders } from "@/lib/api";
import {
    assistanceTypeOptions,
    contractStatusOptions,
    contractTypeOptions,
    formatHours,
    packageHours,
} from "@/lib/contracts";
import {
    contractFieldOrder,
    defaultIncludedHours,
    emptyContractFormState,
    toContractSubmitValues,
    validateContractForm,
    type ContractFieldErrors,
    type ContractFormState,
} from "@/lib/contractForm";
import { resolveCustomerId } from "@/lib/customerLookup";
import { formatCustomerOption, toCustomerPayload } from "@/lib/customers";
import { fieldErrorAria, fieldProps, hasFormChanged, reportFieldErrors } from "@/lib/formField";
import { getTodayDateString } from "@/lib/interventions";
import { toProviderPayload } from "@/lib/providers";
import type { AssistanceType, ContractDto, ContractStatus, ContractType, CustomerDto } from "@/types/dtos";
import { Plus, Save } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";
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
    /** Solo per l'assistenza; `includedHours` è `null` per il full time. */
    assistance: { assistanceType: AssistanceType; includedHours: number | null } | null;
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
const toFormState = (contract: ContractDto): ContractFormState => {
    const assistanceType = contract.assistance?.assistanceType ?? "remote";

    return {
        type: contract.type,
        status: contract.status,
        termMonths: String(contract.termMonths),
        billingMonths: contract.billingMonths != null ? String(contract.billingMonths) : "3",
        device: contract.device,
        note: contract.note ?? "",
        startDate: contract.startDate,
        customer: contract.customerName,
        provider: contract.providerName,
        assistanceType,
        includedHours: contract.assistance?.includedHours != null ? String(contract.assistance.includedHours) : "",
    };
};

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
    // Etichetta della casella -> id, per i valori scelti dai suggerimenti (e per quelli di partenza):
    // vedi lo stesso meccanismo in `CreateInterventionDialog`.
    const [customerIdByOption, setCustomerIdByOption] = useState<Record<string, number>>({});
    const [providerIdByOption, setProviderIdByOption] = useState<Record<string, number>>({});
    // I dialoghi annidati per creare al volo un cliente o un fornitore, come in `CreateInterventionDialog`.
    const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
    const [isCreateProviderDialogOpen, setIsCreateProviderDialogOpen] = useState(false);
    const isDirty = hasFormChanged(formValues, initialFormValues);
    const isEdit = mode === "edit";

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

    /** Cambiando pacchetto le ore tornano alla prima ammessa: quelle di prima possono non valere più. */
    const handleAssistanceTypeChange = (assistanceType: AssistanceType) =>
        handleChange({ assistanceType, includedHours: defaultIncludedHours(assistanceType) });

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

    const handleConfirm = async () => {
        if (isSubmitting) {
            return;
        }

        // Tutti gli errori in un colpo solo, ciascuno accanto al proprio campo.
        const nextErrors: ContractFieldErrors = validateContractForm(formValues);
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

        if (reportFieldErrors(nextErrors, contractFieldOrder, setErrors) || customerId == null || providerId == null) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit(toContractSubmitValues(formValues, customerId, providerId));
            onOpenChange(false);
            toast.success(isEdit ? "Contratto aggiornato con successo" : "Contratto creato con successo");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare il contratto"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const isAssistance = formValues.type === "assistance";
    const hoursOptions = packageHours[formValues.assistanceType].filter((hours): hours is number => hours != null);

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
                contentClassName="sm:max-w-2xl"
                confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
                confirmIcon={Save}
                cancelLabel="Annulla"
                onCancel={() => onOpenChange(false)}
                onConfirm={() => void handleConfirm()}
                cancelDisabled={isSubmitting}
                confirmDisabled={isSubmitting}
                content={
                    // Niente scroll proprio, né un'altezza massima calcolata a mano: a scorrere è il
                    // corpo di `CustomDialog`, l'unico, dentro un dialogo alto al massimo lo schermo.
                    // Il `calc(100dvh - 15rem)` di prima presumeva intestazione e pulsanti alti
                    // 15rem, e sul telefono dava un secondo scroll dentro il primo.
                    <div className="grid content-start gap-4">
                        <FormSection title="Anagrafica">
                            {/* Cliente e fornitore uno sotto l'altro: i nomi lunghi non vengono tagliati. */}
                            <div className="grid items-start gap-4">
                                <FormField
                                    id="customer"
                                    label="Cliente"
                                    className="gap-1"
                                    required
                                    error={errors.customer}
                                >
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

                                <FormField
                                    id="provider"
                                    label="Fornitore"
                                    className="gap-1"
                                    required
                                    error={errors.provider}
                                >
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
                            </div>
                        </FormSection>

                        <FormSection title="Contratto">
                            <div className="grid items-start gap-4 sm:grid-cols-2">
                                <FormField id="type" label="Tipo" className="gap-1">
                                    {/* Il tipo non si cambia dopo la creazione: il server lo rifiuta, e i dati
                                    del pacchetto di un'assistenza non avrebbero dove andare in un noleggio. */}
                                    <Select
                                        value={formValues.type}
                                        disabled={isEdit}
                                        onValueChange={(type) => handleChange({ type: type as ContractType })}
                                    >
                                        <SelectTrigger id="type" className="w-full">
                                            <SelectValue placeholder="Seleziona tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {contractTypeOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormField>

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

                                <MonthsField
                                    id="termMonths"
                                    label="Durata"
                                    className="gap-1"
                                    value={formValues.termMonths}
                                    onChange={(termMonths) => handleChange({ termMonths })}
                                    error={errors.termMonths}
                                />

                                {formValues.type === "rental" ? (
                                    <MonthsField
                                        id="billingMonths"
                                        label="Periodo di fatturazione"
                                        className="gap-1"
                                        value={formValues.billingMonths}
                                        onChange={(billingMonths) => handleChange({ billingMonths })}
                                        error={errors.billingMonths}
                                    />
                                ) : null}

                                <FormField
                                    id="startDate"
                                    label="Data inizio"
                                    className="gap-1"
                                    required
                                    error={errors.startDate}
                                >
                                    <DatePickerField
                                        id="startDate"
                                        {...fieldErrorAria("startDate", errors.startDate)}
                                        value={formValues.startDate}
                                        onValueChange={(startDate) => handleChange({ startDate })}
                                    />
                                </FormField>

                                <FormField
                                    id="device"
                                    label="Dispositivo"
                                    className="gap-1 sm:col-span-2"
                                    required
                                    error={errors.device}
                                >
                                    <Input
                                        {...fieldProps("device", { error: errors.device, required: true })}
                                        autoComplete="off"
                                        placeholder="Es. Server HP ProLiant"
                                        value={formValues.device}
                                        onChange={(event) => handleChange({ device: event.target.value })}
                                    />
                                </FormField>

                                <FormField id="note" label="Note" className="gap-1 sm:col-span-2">
                                    <Textarea
                                        id="note"
                                        className="resize-none"
                                        rows={3}
                                        placeholder="Annotazioni libere sul contratto"
                                        value={formValues.note}
                                        onChange={(event) => handleChange({ note: event.target.value })}
                                    />
                                </FormField>
                            </div>
                        </FormSection>

                        {isAssistance ? (
                            <FormSection title="Pacchetto assistenza">
                                <div className="grid items-start gap-4 sm:grid-cols-2">
                                    <FormField id="assistanceType" label="Pacchetto" className="gap-1">
                                        <Select
                                            value={formValues.assistanceType}
                                            onValueChange={(value) =>
                                                handleAssistanceTypeChange(value as AssistanceType)
                                            }
                                        >
                                            <SelectTrigger id="assistanceType" className="w-full">
                                                <SelectValue placeholder="Seleziona pacchetto" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {assistanceTypeOptions.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormField>

                                    {/* Il full time ha ore illimitate: non c'è niente da scegliere. */}
                                    {formValues.assistanceType === "full_time" ? null : (
                                        <FormField
                                            id="includedHours"
                                            label="Ore al mese"
                                            className="gap-1"
                                            required
                                            error={errors.includedHours}
                                        >
                                            <Select
                                                value={formValues.includedHours}
                                                // Radix può richiamare `onValueChange("")` quando valore e voci cambiano insieme (apertura in
                                                // modifica): un valore vuoto non è una scelta e cancellerebbe quello del contratto.
                                                onValueChange={(includedHours) =>
                                                    includedHours && handleChange({ includedHours })
                                                }
                                            >
                                                <SelectTrigger
                                                    id="includedHours"
                                                    {...fieldErrorAria("includedHours", errors.includedHours)}
                                                    className="w-full"
                                                >
                                                    <SelectValue placeholder="Seleziona ore" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {hoursOptions.map((hours) => (
                                                        <SelectItem key={hours} value={String(hours)}>
                                                            {formatHours(hours)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormField>
                                    )}
                                </div>
                            </FormSection>
                        ) : null}
                    </div>
                }
            />

            {/* Il cliente o il fornitore appena creato � gi� risolto: lo si registra con la stessa etichetta
            dei suggerimenti (`formatInitialCustomer`), cos� vale come scelto dall'elenco e al
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
