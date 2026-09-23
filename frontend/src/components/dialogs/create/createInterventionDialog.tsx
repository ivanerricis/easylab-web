import CustomDialog from "@/components/dialogs/customDialog";
import { FieldError, RequiredMark } from "@/components/form-field";
import { fieldErrorAria, hasFormChanged } from "@/lib/formField";
import { formatCustomerOption, toCustomerPayload } from "@/lib/customers";
import CreateCustomerDialog from "@/components/dialogs/create/createCustomerDialog";
import {
    InterventionCollaboratorField,
    InterventionDetailsSection,
} from "@/components/dialogs/intervention-form-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import InputWithAdd from "@/components/inputWithAdd";
import { createCustomer, getApiErrorMessage, listCollaborators, listCustomers } from "@/lib/api";
import {
    emptyInterventionFormState,
    interventionFieldOrder,
    toInterventionSubmitFields,
    validateInterventionForm,
    type InterventionFieldErrors,
    type InterventionFormState,
} from "@/lib/interventionForm";
import { getTodayDateString } from "@/lib/interventions";
import type { CollaboratorDto, CustomerDto, InterventionStatus, InterventionType } from "@/types/dtos";
import { Plus, Save } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export type CreateInterventionSubmitValues = {
    type: InterventionType;
    status: InterventionStatus;
    /** `null` quando l'intervento è solo programmato: il lavoro non è ancora stato svolto. */
    description: string | null;
    problem: string | null;
    note: string | null;
    /** Facoltativo per qualunque tipo di intervento. */
    price: number | null;
    /** A differenza dei report: solo pagato/non pagato, senza distinguere contanti/carta. */
    paid: boolean;
    /** Indipendente dal pagamento: dice se va emessa fattura. Di default no. */
    toInvoice: boolean;
    customer: string;
    customerId: number | null;
    collaboratorId: number;
    interventionDate: string | null;
    startTime: string | null;
    endTime: string | null;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: CreateInterventionSubmitValues) => Promise<void> | void;
    initialDate?: string;
    /**
     * Il cliente da cui si parte, quando il dialogo si apre dalla sua scheda: la casella è già
     * compilata e il cliente già risolto, e resta modificabile. Il modulo non conta come
     * modificato finché non lo si cambia.
     */
    initialCustomer?: CustomerDto | null;
};

type FormValues = InterventionFormState & { customer: string };

type FieldErrors = InterventionFieldErrors & { customer?: string };

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
const fieldOrder = ["customer", ...interventionFieldOrder] as const;

/**
 * Il modulo come si presenta all'apertura. Nella quasi totalità dei casi l'intervento è di oggi;
 * resta comunque modificabile, e `initialDate` (slot cliccato nel calendario) ha la precedenza.
 */
const buildEmptyFormValues = (initialDate?: string, initialCustomerOption = ""): FormValues => ({
    ...emptyInterventionFormState(initialDate ?? getTodayDateString()),
    customer: initialCustomerOption,
});

const CreateInterventionDialog = ({ open, onOpenChange, onSubmit, initialDate, initialCustomer = null }: Props) => {
    const [formValues, setFormValues] = useState(() => buildEmptyFormValues());
    // Una copia di com'era il modulo all'apertura, non una costante: la data di partenza
    // cambia con lo slot del calendario (e con il giorno, se la pagina resta aperta a lungo).
    const [initialFormValues, setInitialFormValues] = useState(formValues);
    const isDirty = hasFormChanged(formValues, initialFormValues);
    const [collaborators, setCollaborators] = useState<CollaboratorDto[]>([]);
    const [customerIdByOption, setCustomerIdByOption] = useState<Record<string, number>>({});
    const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const initialCustomerId = initialCustomer?.id ?? null;
    const initialCustomerOption = initialCustomer
        ? formatCustomerOption(
              initialCustomer.firstName,
              initialCustomer.lastName,
              initialCustomer.phoneNumber,
              initialCustomer.phoneNumberSecondary
          )
        : "";

    /** Applica i campi cambiati e toglie l'errore a quelli toccati. */
    const handleChange = (patch: Partial<FormValues>) => {
        setFormValues((prev) => ({ ...prev, ...patch }));
        setErrors((prev) => {
            const next = { ...prev };
            for (const field of Object.keys(patch)) {
                delete next[field as keyof FieldErrors];
            }
            return next;
        });
    };

    useEffect(() => {
        if (!open) {
            return;
        }

        startTransition(() => {
            setErrors({});
            const emptyFormValues = buildEmptyFormValues(initialDate, initialCustomerOption);
            setFormValues(emptyFormValues);
            setInitialFormValues(emptyFormValues);
            setCustomerIdByOption(initialCustomerId == null ? {} : { [initialCustomerOption]: initialCustomerId });
        });

        const loadCollaborators = async () => {
            try {
                const collaboratorsData = await listCollaborators();
                setCollaborators(collaboratorsData);
            } catch (error) {
                toast.error(getApiErrorMessage(error, "Impossibile caricare i collaboratori"));
            }
        };

        void loadCollaborators();
    }, [open, initialDate, initialCustomerId, initialCustomerOption]);

    const searchCustomers = useCallback(async (query: string, signal: AbortSignal) => {
        const customers = await listCustomers({ pageSize: 8, search: query || undefined, signal });
        const options = customers.items.map((customer) => ({
            id: customer.id,
            label: formatCustomerOption(
                customer.firstName,
                customer.lastName,
                customer.phoneNumber,
                customer.phoneNumberSecondary
            ),
        }));

        setCustomerIdByOption((prev) => ({
            ...prev,
            ...Object.fromEntries(options.map((item) => [item.label, item.id])),
        }));

        return options.map((item) => item.label);
    }, []);

    const handleConfirm = async () => {
        if (isSubmitting) {
            return;
        }

        // Tutti gli errori in un colpo solo, ciascuno accanto al proprio campo: prima ogni
        // controllo usciva dalla funzione con un toast, quindi su un form da dieci campi si
        // scopriva un problema per salvataggio, e il messaggio non diceva dove fosse.
        const nextErrors: FieldErrors = validateInterventionForm(formValues);

        if (formValues.customer.trim() === "") {
            nextErrors.customer = "Seleziona un cliente";
        }

        setErrors(nextErrors);

        const firstInvalidField = fieldOrder.find((field) => nextErrors[field]);

        if (firstInvalidField) {
            document.getElementById(firstInvalidField)?.focus();
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({
                ...toInterventionSubmitFields(formValues),
                customer: formValues.customer,
                customerId: customerIdByOption[formValues.customer] ?? null,
            });
            // Niente avviso di successo qui: lo dà chi ha creato, che conosce il numero
            // assegnato e offre di aprire o stampare (vedi `showCreatedToast`).
            onOpenChange(false);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare l'intervento"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <CustomDialog
                open={open}
                onOpenChange={onOpenChange}
                isDirty={isDirty}
                title="Nuovo intervento"
                description="Inserisci i dati dell'intervento e conferma per salvare."
                contentClassName="sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl"
                confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
                confirmIcon={Save}
                cancelLabel="Annulla"
                onCancel={() => onOpenChange(false)}
                onConfirm={() => void handleConfirm()}
                cancelDisabled={isSubmitting}
                confirmDisabled={isSubmitting}
                content={
                    <div className="grid max-h-[72vh] gap-4 overflow-y-auto py-1 pr-1">
                        <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                Anagrafica
                            </h3>

                            <div className="grid items-start gap-4 lg:grid-cols-2">
                                <div className="grid">
                                    <Label htmlFor="customer" className="text-lg">
                                        Cliente
                                        <RequiredMark />
                                    </Label>
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
                                    <FieldError id="customer" error={errors.customer} />
                                </div>

                                <InterventionCollaboratorField
                                    values={formValues}
                                    errors={errors}
                                    onChange={handleChange}
                                    collaborators={collaborators}
                                />
                            </div>
                        </section>

                        <InterventionDetailsSection values={formValues} errors={errors} onChange={handleChange} />
                    </div>
                }
            />

            <CreateCustomerDialog
                open={isCreateCustomerDialogOpen}
                onOpenChange={setIsCreateCustomerDialogOpen}
                onSubmit={async (values) => {
                    const createdCustomer = await createCustomer(toCustomerPayload(values));

                    const customerOption = formatCustomerOption(
                        createdCustomer.firstName,
                        createdCustomer.lastName,
                        createdCustomer.phoneNumber,
                        createdCustomer.phoneNumberSecondary
                    );
                    setCustomerIdByOption((prev) => ({ ...prev, [customerOption]: createdCustomer.id }));
                    handleChange({ customer: customerOption });
                }}
            />
        </>
    );
};

export default CreateInterventionDialog;
