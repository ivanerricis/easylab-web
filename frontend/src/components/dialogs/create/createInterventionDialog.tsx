import CustomDialog from "@/components/dialogs/customDialog";
import { FieldError } from "@/components/form-field";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import { formatCustomerOption } from "@/lib/customers";
import CreateCustomerDialog from "@/components/dialogs/create/createCustomerDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import InputWithAdd from "@/components/inputWithAdd";
import DatePickerField from "@/components/date-picker-field";
import { createCustomer, getApiErrorMessage, listCollaborators, listCustomers } from "@/lib/api";
import {
    getInterventionValidationError,
    type InterventionField,
    interventionDateLabel,
    interventionDescriptionLabel,
    interventionStatusOptions,
    interventionTypeOptions,
    isOnSiteInterventionType,
    isScheduledInterventionStatus,
    getTodayDateString,
} from "@/lib/interventions";
import type { CollaboratorDto, InterventionStatus, InterventionType } from "@/types/dtos";
import { Plus, Save } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const formatPersonName = (firstName: string, lastName: string | null) => `${firstName} ${lastName ?? ""}`.trim();

export type CreateInterventionSubmitValues = {
    type: InterventionType;
    status: InterventionStatus;
    /** `null` quando l'intervento è solo programmato: il lavoro non è ancora stato svolto. */
    description: string | null;
    problem: string | null;
    note: string | null;
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
    onSubmit?: (values: CreateInterventionSubmitValues) => Promise<void> | void;
    initialDate?: string;
};

type FieldErrors = Partial<Record<"customer" | "collaboratorId" | InterventionField, string>>;

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
const fieldOrder = [
    "customer",
    "collaboratorId",
    "interventionDate",
    "startTime",
    "endTime",
    "problem",
    "description",
] as const;

const CreateInterventionDialog = ({ open, onOpenChange, onSubmit, initialDate }: Props) => {
    const [formValues, setFormValues] = useState({
        type: "consegna_materiale" as InterventionType,
        status: "programmato" as InterventionStatus,
        description: "",
        problem: "",
        note: "",
        customer: "",
        collaboratorId: "",
        interventionDate: getTodayDateString(),
        startTime: "",
        endTime: "",
    });
    const [collaborators, setCollaborators] = useState<CollaboratorDto[]>([]);
    const [customerIdByOption, setCustomerIdByOption] = useState<Record<string, number>>({});
    const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isOnSite = isOnSiteInterventionType(formValues.type);
    // Un intervento ancora da svolgere non ha orari né lavoro da descrivere: i campi
    // restano compilabili, ma smettono di essere obbligatori e l'etichetta lo dice.
    const isScheduled = isScheduledInterventionStatus(formValues.status);

    useEffect(() => {
        if (!open) {
            return;
        }

        startTransition(() => {
            setErrors({});
            setFormValues({
                type: "consegna_materiale",
                status: "programmato",
                description: "",
                problem: "",
                note: "",
                customer: "",
                collaboratorId: "",
                // Nella quasi totalità dei casi l'intervento è di oggi; resta comunque
                // modificabile, e `initialDate` (slot cliccato nel calendario) ha la precedenza.
                interventionDate: initialDate ?? getTodayDateString(),
                startTime: "",
                endTime: "",
            });
            setCustomerIdByOption({});
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
    }, [open, initialDate]);

    const searchCustomers = useCallback(async (query: string) => {
        const customers = await listCustomers({ pageSize: 8, search: query || undefined });
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
        const nextErrors: FieldErrors = {};

        if (formValues.customer.trim() === "") {
            nextErrors.customer = "Seleziona un cliente";
        }

        if (formValues.collaboratorId === "") {
            nextErrors.collaboratorId = "Seleziona un collaboratore";
        }

        const validationError = getInterventionValidationError(formValues);

        if (validationError) {
            nextErrors[validationError.field] = validationError.message;
        }

        setErrors(nextErrors);

        const firstInvalidField = fieldOrder.find((field) => nextErrors[field]);

        if (firstInvalidField) {
            document.getElementById(firstInvalidField)?.focus();
            return;
        }

        if (!onSubmit) {
            onOpenChange(false);
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({
                type: formValues.type,
                status: formValues.status,
                description: formValues.description.trim() || null,
                problem: isOnSite ? formValues.problem.trim() : null,
                note: formValues.note.trim() || null,
                customer: formValues.customer,
                customerId: customerIdByOption[formValues.customer] ?? null,
                collaboratorId: Number(formValues.collaboratorId),
                interventionDate: formValues.interventionDate,
                startTime: isOnSite ? formValues.startTime || null : null,
                endTime: isOnSite ? formValues.endTime || null : null,
            });
            onOpenChange(false);
            toast.success("Intervento creato con successo");
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
                title="Nuovo intervento"
                description="Inserisci i dati dell'intervento e conferma per salvare."
                contentClassName="sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl"
                preventOutsideClose
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

                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="grid">
                                    <Label htmlFor="customer" className="text-lg">
                                        Cliente
                                    </Label>
                                    <div className="flex">
                                        <InputWithAdd
                                            id="customer"
                                            {...fieldErrorAria("customer", errors.customer)}
                                            placeholder="Cliente"
                                            inputClassName="rounded-r-none"
                                            value={formValues.customer}
                                            onSearch={searchCustomers}
                                            onChange={(value) => {
                                                setFormValues((prev) => ({ ...prev, customer: value }));
                                                setErrors((prev) => ({ ...prev, customer: undefined }));
                                            }}
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

                                <div className="grid gap-1">
                                    <Label htmlFor="collaboratorId" className="text-lg">
                                        Collaboratore
                                    </Label>
                                    <Select
                                        value={formValues.collaboratorId}
                                        onValueChange={(value) => {
                                            setFormValues((prev) => ({ ...prev, collaboratorId: value }));
                                            setErrors((prev) => ({ ...prev, collaboratorId: undefined }));
                                        }}
                                    >
                                        <SelectTrigger
                                            id="collaboratorId"
                                            {...fieldErrorAria("collaboratorId", errors.collaboratorId)}
                                            className="w-full"
                                        >
                                            <SelectValue placeholder="Seleziona collaboratore" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {collaborators.map((collaborator) => (
                                                <SelectItem key={collaborator.id} value={String(collaborator.id)}>
                                                    {formatPersonName(collaborator.firstName, collaborator.lastName)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FieldError id="collaboratorId" error={errors.collaboratorId} />
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                Intervento
                            </h3>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="grid gap-1">
                                    <Label htmlFor="type" className="text-lg">
                                        Tipo intervento
                                    </Label>
                                    <Select
                                        value={formValues.type}
                                        onValueChange={(value) =>
                                            setFormValues((prev) => ({ ...prev, type: value as InterventionType }))
                                        }
                                    >
                                        <SelectTrigger id="type" className="w-full">
                                            <SelectValue placeholder="Seleziona tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {interventionTypeOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-1">
                                    <Label htmlFor="status" className="text-lg">
                                        Stato
                                    </Label>
                                    <Select
                                        value={formValues.status}
                                        onValueChange={(value) =>
                                            setFormValues((prev) => ({ ...prev, status: value as InterventionStatus }))
                                        }
                                    >
                                        <SelectTrigger id="status" className="w-full">
                                            <SelectValue placeholder="Seleziona stato" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {interventionStatusOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-1">
                                    <Label htmlFor="interventionDate" className="text-lg">
                                        {interventionDateLabel(formValues.type)}
                                    </Label>
                                    <DatePickerField
                                        id="interventionDate"
                                        {...fieldErrorAria("interventionDate", errors.interventionDate)}
                                        value={formValues.interventionDate}
                                        onValueChange={(value) => {
                                            setFormValues((prev) => ({ ...prev, interventionDate: value }));
                                            setErrors((prev) => ({ ...prev, interventionDate: undefined }));
                                        }}
                                    />
                                    <FieldError id="interventionDate" error={errors.interventionDate} />
                                </div>

                                {isOnSite ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-1">
                                            <Label htmlFor="startTime" className="text-lg">
                                                Ora inizio
                                                {isScheduled ? (
                                                    <span className="text-base text-muted-foreground">
                                                        {" "}
                                                        (facoltativa)
                                                    </span>
                                                ) : null}
                                            </Label>
                                            <Input
                                                {...fieldProps("startTime", { error: errors.startTime })}
                                                className="text-lg!"
                                                type="time"
                                                value={formValues.startTime}
                                                onChange={(event) => {
                                                    setFormValues((prev) => ({
                                                        ...prev,
                                                        startTime: event.target.value,
                                                    }));
                                                    setErrors((prev) => ({ ...prev, startTime: undefined }));
                                                }}
                                            />
                                            <FieldError id="startTime" error={errors.startTime} />
                                        </div>

                                        <div className="grid gap-1">
                                            <Label htmlFor="endTime" className="text-lg">
                                                Ora fine
                                                {isScheduled ? (
                                                    <span className="text-base text-muted-foreground">
                                                        {" "}
                                                        (facoltativa)
                                                    </span>
                                                ) : null}
                                            </Label>
                                            <Input
                                                {...fieldProps("endTime", { error: errors.endTime })}
                                                className="text-lg!"
                                                type="time"
                                                value={formValues.endTime}
                                                onChange={(event) => {
                                                    setFormValues((prev) => ({ ...prev, endTime: event.target.value }));
                                                    setErrors((prev) => ({ ...prev, endTime: undefined }));
                                                }}
                                            />
                                            <FieldError id="endTime" error={errors.endTime} />
                                        </div>
                                    </div>
                                ) : null}

                                {isOnSite ? (
                                    <div className="grid gap-1 lg:col-span-2">
                                        <Label htmlFor="problem" className="text-lg">
                                            Problema
                                        </Label>
                                        <Textarea
                                            {...fieldProps("problem", { error: errors.problem })}
                                            className="resize-none text-lg!"
                                            rows={4}
                                            placeholder="Descrivi il problema riscontrato"
                                            value={formValues.problem}
                                            onChange={(event) => {
                                                setFormValues((prev) => ({ ...prev, problem: event.target.value }));
                                                setErrors((prev) => ({ ...prev, problem: undefined }));
                                            }}
                                        />
                                        <FieldError id="problem" error={errors.problem} />
                                    </div>
                                ) : null}

                                <div className="grid gap-1 lg:col-span-2">
                                    <Label htmlFor="description" className="text-lg">
                                        {interventionDescriptionLabel(formValues.type)}
                                        {isScheduled ? (
                                            <span className="text-base text-muted-foreground"> (facoltativo)</span>
                                        ) : null}
                                    </Label>
                                    <Textarea
                                        {...fieldProps("description", { error: errors.description })}
                                        className="resize-none text-lg!"
                                        rows={4}
                                        placeholder={
                                            formValues.type === "consegna_materiale"
                                                ? "Elenca i materiali da consegnare"
                                                : "Descrivi l'assistenza effettuata"
                                        }
                                        value={formValues.description}
                                        onChange={(event) => {
                                            setFormValues((prev) => ({ ...prev, description: event.target.value }));
                                            setErrors((prev) => ({ ...prev, description: undefined }));
                                        }}
                                    />
                                    <FieldError id="description" error={errors.description} />
                                </div>

                                <div className="grid gap-1 lg:col-span-2">
                                    <Label htmlFor="note" className="text-lg">
                                        Note
                                        <span className="text-base text-muted-foreground"> (facoltative)</span>
                                    </Label>
                                    <Textarea
                                        id="note"
                                        className="resize-none text-lg!"
                                        rows={4}
                                        placeholder="Annotazioni libere: accordi col cliente, promemoria, materiale da riportare"
                                        value={formValues.note}
                                        onChange={(event) =>
                                            setFormValues((prev) => ({ ...prev, note: event.target.value }))
                                        }
                                    />
                                </div>
                            </div>
                        </section>
                    </div>
                }
            />

            <CreateCustomerDialog
                open={isCreateCustomerDialogOpen}
                onOpenChange={setIsCreateCustomerDialogOpen}
                onSubmit={async (values) => {
                    const createdCustomer = await createCustomer({
                        firstName: String(values.firstName).trim(),
                        lastName: String(values.lastName).trim() === "" ? null : String(values.lastName).trim(),
                        phoneNumber:
                            String(values.phoneNumber).trim() === "" ? null : String(values.phoneNumber).trim(),
                        phoneNumberSecondary:
                            String(values.phoneNumberSecondary).trim() === ""
                                ? null
                                : String(values.phoneNumberSecondary).trim(),
                        email: String(values.email).trim() === "" ? null : String(values.email).trim(),
                        city: String(values.city).trim() === "" ? null : String(values.city).trim(),
                    });

                    const customerOption = formatCustomerOption(
                        createdCustomer.firstName,
                        createdCustomer.lastName,
                        createdCustomer.phoneNumber,
                        createdCustomer.phoneNumberSecondary
                    );
                    setCustomerIdByOption((prev) => ({ ...prev, [customerOption]: createdCustomer.id }));
                    setFormValues((prev) => ({ ...prev, customer: customerOption }));
                }}
            />
        </>
    );
};

export default CreateInterventionDialog;
