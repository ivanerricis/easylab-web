import DatePickerField from "@/components/date-picker-field";
import EuroInput from "@/components/euro-input";
import { FieldError, RequiredMark } from "@/components/form-field";
import PaidStatusSelector from "@/components/paid-status-selector";
import ToInvoiceSelector from "@/components/to-invoice-selector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import type { InterventionFieldErrors, InterventionFormState } from "@/lib/interventionForm";
import {
    interventionDateLabel,
    interventionDescriptionLabel,
    interventionStatusOptions,
    interventionTypeOptions,
    isOnSiteInterventionType,
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
    <div className="grid gap-1">
        <Label htmlFor="collaboratorId" className="text-lg">
            Collaboratore
            <RequiredMark />
        </Label>
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
        <FieldError id="collaboratorId" error={errors.collaboratorId} />
    </div>
);

/** L'intera sezione "Intervento": tipo, stato, data, prezzo, pagamento, orari, problema, descrizione, note. */
export const InterventionDetailsSection = ({ values, errors, onChange }: FieldsProps) => {
    const isOnSite = isOnSiteInterventionType(values.type);
    // Orari e lavoro svolto si chiedono solo a intervento completato: prima restano
    // compilabili ma senza asterisco. L'asterisco rosso è l'unico segno dell'obbligo: le
    // scritte "(facoltativo)" accanto agli altri campi sono state tolte perché affollavano
    // il form, e dicevano la stessa cosa della sua assenza.
    const isCompleted = isCompletedInterventionStatus(values.status);

    return (
        <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Intervento</h3>

            {/*
                `items-start` in tutte le griglie di campi: quando un campo mostra l'errore sotto di
                sé la riga si allunga, e senza le celle vicine si stiravano con lei spingendo in giù
                etichetta e campo.
            */}
            <div className="grid items-start gap-4 lg:grid-cols-2">
                <div className="grid gap-1">
                    <Label htmlFor="type" className="text-lg">
                        Tipo intervento
                    </Label>
                    <Select value={values.type} onValueChange={(type) => onChange({ type: type as InterventionType })}>
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
                </div>

                <div className="grid gap-1">
                    <Label htmlFor="interventionDate" className="text-lg">
                        {interventionDateLabel(values.type)}
                        <RequiredMark />
                    </Label>
                    <DatePickerField
                        id="interventionDate"
                        {...fieldErrorAria("interventionDate", errors.interventionDate)}
                        value={values.interventionDate}
                        onValueChange={(interventionDate) => onChange({ interventionDate })}
                    />
                    <FieldError id="interventionDate" error={errors.interventionDate} />
                </div>

                <div className="grid gap-1">
                    <Label htmlFor="price" className="text-lg">
                        Prezzo
                    </Label>
                    <EuroInput
                        {...fieldProps("price", { error: errors.price })}
                        value={values.price}
                        onChange={(event) => onChange({ price: event.target.value })}
                    />
                    <FieldError id="price" error={errors.price} />
                </div>

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

                {isOnSite ? (
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
                            <div key={field} className="grid gap-1">
                                <Label htmlFor={field} className="text-lg">
                                    {label}
                                    {isCompleted ? <RequiredMark /> : null}
                                </Label>
                                <Input
                                    {...fieldProps(field, { error: errors[field] })}
                                    type="time"
                                    value={values[field]}
                                    onChange={(event) => onChange({ [field]: event.target.value })}
                                />
                                <FieldError id={field} error={errors[field]} />
                            </div>
                        ))}
                    </div>
                ) : null}

                {isOnSite ? (
                    <div className="grid gap-1 lg:col-span-2">
                        <Label htmlFor="problem" className="text-lg">
                            Problema
                            <RequiredMark />
                        </Label>
                        <Textarea
                            {...fieldProps("problem", { error: errors.problem })}
                            className="resize-none"
                            rows={4}
                            placeholder="Descrivi il problema riscontrato"
                            value={values.problem}
                            onChange={(event) => onChange({ problem: event.target.value })}
                        />
                        <FieldError id="problem" error={errors.problem} />
                    </div>
                ) : null}

                <div className="grid gap-1 lg:col-span-2">
                    <Label htmlFor="description" className="text-lg">
                        {interventionDescriptionLabel(values.type)}
                        {isCompleted ? <RequiredMark /> : null}
                    </Label>
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
                    <FieldError id="description" error={errors.description} />
                </div>

                <div className="grid gap-1 lg:col-span-2">
                    <Label htmlFor="note" className="text-lg">
                        Note
                    </Label>
                    <Textarea
                        id="note"
                        className="resize-none"
                        rows={4}
                        placeholder="Annotazioni libere: accordi col cliente, promemoria, materiale da riportare"
                        value={values.note}
                        onChange={(event) => onChange({ note: event.target.value })}
                    />
                </div>
            </div>
        </section>
    );
};
