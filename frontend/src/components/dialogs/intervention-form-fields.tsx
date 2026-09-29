import DatePickerField from "@/components/date-picker-field";
import EuroInput from "@/components/euro-input";
import FormField from "@/components/form-field";
import FormSection from "@/components/dialogs/form-section";
import PaidStatusSelector from "@/components/paid-status-selector";
import ToInvoiceSelector from "@/components/to-invoice-selector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import {
    interventionDetailsPartTitles,
    type InterventionDetailsPart,
    type InterventionFieldErrors,
    type InterventionFormState,
} from "@/lib/interventionForm";
import {
    interventionDateLabel,
    interventionDescriptionLabel,
    interventionStatusOptions,
    interventionTypeOptions,
    isAssistanceInterventionType,
    isCompletedInterventionStatus,
} from "@/lib/interventions";
import { formatPersonName } from "@/lib/people";
import type { CollaboratorDto, InterventionStatus, InterventionType } from "@/types/dtos";

/**
 * I campi dell'intervento, uguali nei dialoghi di creazione e di modifica: prima ciascuno aveva
 * la sua copia di circa 230 righe, e ogni modifica andava fatta due volte (vedi
 * `InterventionFormState`). `onChange` riceve i campi cambiati; il dialogo li applica e toglie
 * l'errore dai campi toccati.
 */
type FieldsProps = {
    values: InterventionFormState;
    errors: InterventionFieldErrors;
    onChange: (patch: Partial<InterventionFormState>) => void;
};

/** Il collaboratore: sta nella sezione "Anagrafica", accanto al cliente, che i due dialoghi mostrano in modo diverso. */
export const InterventionCollaboratorField = ({
    values,
    errors,
    onChange,
    collaborators,
}: FieldsProps & { collaborators: CollaboratorDto[] }) => (
    <FormField id="collaboratorId" label="Collaboratore" className="gap-1" required error={errors.collaboratorId}>
        <Select value={values.collaboratorId} onValueChange={(collaboratorId) => onChange({ collaboratorId })}>
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
                        {formatPersonName(collaborator)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    </FormField>
);

/** L'intera sezione "Intervento": tipo, stato, data, prezzo, pagamento, orari, problema, descrizione, note. */
export const InterventionDetailsSection = ({
    values,
    errors,
    onChange,
    part,
}: FieldsProps & { part?: InterventionDetailsPart }) => {
    const shows = (fieldPart: InterventionDetailsPart) => part == null || part === fieldPart;
    const isAssistance = isAssistanceInterventionType(values.type);
    // Orari e lavoro svolto si chiedono solo a intervento completato: prima restano
    // compilabili ma senza asterisco. L'asterisco rosso è l'unico segno dell'obbligo: le
    // scritte "(facoltativo)" accanto agli altri campi sono state tolte perché affollavano
    // il form, e dicevano la stessa cosa della sua assenza.
    const isCompleted = isCompletedInterventionStatus(values.status);

    return (
        <FormSection title={part ? interventionDetailsPartTitles[part] : "Intervento"}>
            {/*
                `items-start` in tutte le griglie di campi: quando un campo mostra l'errore sotto di
                sé la riga si allunga, e senza le celle vicine si stiravano con lei spingendo in giù
                etichetta e campo.
            */}
            <div className="grid items-start gap-4 lg:grid-cols-2">
                {shows("schedule") ? (
                    <>
                        <FormField id="type" label="Tipo intervento" className="gap-1">
                            <Select
                                value={values.type}
                                onValueChange={(type) => onChange({ type: type as InterventionType })}
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
                        </FormField>

                        <FormField id="status" label="Stato" className="gap-1">
                            <Select
                                value={values.status}
                                onValueChange={(status) => onChange({ status: status as InterventionStatus })}
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
                        </FormField>

                        <FormField
                            id="interventionDate"
                            label={interventionDateLabel(values.type)}
                            className="gap-1"
                            required
                            error={errors.interventionDate}
                        >
                            <DatePickerField
                                id="interventionDate"
                                {...fieldErrorAria("interventionDate", errors.interventionDate)}
                                value={values.interventionDate}
                                onValueChange={(interventionDate) => onChange({ interventionDate })}
                            />
                        </FormField>
                    </>
                ) : null}

                {shows("payment") ? (
                    <>
                        <FormField id="price" label="Prezzo" className="gap-1" error={errors.price}>
                            <EuroInput
                                {...fieldProps("price", { error: errors.price })}
                                value={values.price}
                                onChange={(event) => onChange({ price: event.target.value })}
                            />
                        </FormField>

                        {/*
                         * Larghi quanto tutta la sezione: dentro mezza colonna le due schede radio si
                         * stringono sotto i 200px e "Non da fatturare" andava a capo, lasciando la riga
                         * sfalsata rispetto al pagamento qui accanto.
                         */}
                        <div className="grid gap-1 lg:col-span-2">
                            <Label className="text-lg">Pagamento</Label>
                            <PaidStatusSelector value={values.paid} onValueChange={(paid) => onChange({ paid })} />
                        </div>

                        <div className="grid gap-1 lg:col-span-2">
                            <Label className="text-lg">Fatturazione</Label>
                            <ToInvoiceSelector
                                value={values.toInvoice}
                                onValueChange={(toInvoice) => onChange({ toInvoice })}
                            />
                        </div>
                    </>
                ) : null}

                {isAssistance && shows("schedule") ? (
                    // Anche gli orari occupano tutta la sezione, come le altre coppie: stretti in
                    // mezza colonna le etichette andavano a capo ("Ora / inizio") e i campi non
                    // erano allineati con quelli sopra.
                    <div className="grid grid-cols-2 items-start gap-4 lg:col-span-2">
                        {(
                            [
                                ["startTime", "Ora inizio"],
                                ["endTime", "Ora fine"],
                            ] as const
                        ).map(([field, label]) => (
                            <FormField
                                key={field}
                                id={field}
                                label={label}
                                className="gap-1"
                                required={isCompleted}
                                error={errors[field]}
                            >
                                <Input
                                    {...fieldProps(field, { error: errors[field] })}
                                    type="time"
                                    value={values[field]}
                                    onChange={(event) => onChange({ [field]: event.target.value })}
                                />
                            </FormField>
                        ))}
                    </div>
                ) : null}

                {isAssistance && shows("work") ? (
                    <FormField
                        id="problem"
                        label="Problema"
                        className="gap-1 lg:col-span-2"
                        required
                        error={errors.problem}
                    >
                        <Textarea
                            {...fieldProps("problem", { error: errors.problem })}
                            className="resize-none"
                            rows={4}
                            placeholder="Descrivi il problema riscontrato"
                            value={values.problem}
                            onChange={(event) => onChange({ problem: event.target.value })}
                        />
                    </FormField>
                ) : null}

                {shows("work") ? (
                    <>
                        <FormField
                            id="description"
                            label={interventionDescriptionLabel(values.type)}
                            className="gap-1 lg:col-span-2"
                            required={isCompleted}
                            error={errors.description}
                        >
                            <Textarea
                                {...fieldProps("description", { error: errors.description })}
                                className="resize-none"
                                rows={4}
                                placeholder={
                                    values.type === "consegna_materiale"
                                        ? "Elenca i materiali da consegnare"
                                        : "Descrivi l'assistenza effettuata"
                                }
                                value={values.description}
                                onChange={(event) => onChange({ description: event.target.value })}
                            />
                        </FormField>

                        <FormField id="note" label="Note" className="gap-1 lg:col-span-2">
                            <Textarea
                                id="note"
                                className="resize-none"
                                rows={4}
                                placeholder="Annotazioni libere: accordi col cliente, promemoria, materiale da riportare"
                                value={values.note}
                                onChange={(event) => onChange({ note: event.target.value })}
                            />
                        </FormField>
                    </>
                ) : null}
            </div>
        </FormSection>
    );
};
