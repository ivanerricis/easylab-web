import DatePickerField from "@/components/date-picker-field";
import EuroInput from "@/components/euro-input";
import FormField from "@/components/form-field";
import FormSection, { tintedSectionClassName } from "@/components/dialogs/form-section";
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
import { cn } from "@/lib/utils";
import type { CollaboratorDto, InterventionStatus, InterventionType } from "@/types/dtos";
import type { ReactNode } from "react";

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
    <FormField
        labelSize="sm"
        id="collaboratorId"
        label="Collaboratore"
        className="gap-1"
        required
        error={errors.collaboratorId}
    >
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

/** Il tipo: decide quali altri campi compaiono (orari e problema solo per l'assistenza) e come si chiamano. */
const InterventionTypeField = ({ values, onChange }: Pick<FieldsProps, "values" | "onChange">) => (
    <FormField labelSize="sm" id="type" label="Tipo intervento" className="gap-1">
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
    </FormField>
);

const InterventionStatusField = ({ values, onChange }: Pick<FieldsProps, "values" | "onChange">) => (
    <FormField labelSize="sm" id="status" label="Stato" className="gap-1">
        <Select value={values.status} onValueChange={(status) => onChange({ status: status as InterventionStatus })}>
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
);

const InterventionDateField = ({ values, errors, onChange }: FieldsProps) => (
    <FormField
        labelSize="sm"
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
);

/**
 * Orari e assistenza effettuata si chiedono solo a intervento completato: prima restano compilabili
 * ma senza asterisco, che segue `values.status` anche quando lo Stato sta in un altro riquadro (o
 * in un altro passo). L'asterisco rosso è l'unico segno dell'obbligo: le scritte "(facoltativo)"
 * accanto agli altri campi sono state tolte perché affollavano il form, e dicevano la stessa cosa
 * della sua assenza.
 */
const InterventionTimeFields = ({ values, errors, onChange }: FieldsProps) => (
    // Occupano tutta la riga della griglia, come le altre coppie: stretti in mezza colonna le
    // etichette andavano a capo ("Ora / inizio") e i campi non erano allineati con quelli sopra.
    <div className="grid grid-cols-2 items-start gap-4 lg:col-span-2">
        {(
            [
                ["startTime", "Ora inizio"],
                ["endTime", "Ora fine"],
            ] as const
        ).map(([field, label]) => (
            <FormField
                labelSize="sm"
                key={field}
                id={field}
                label={label}
                className="gap-1"
                required={isCompletedInterventionStatus(values.status)}
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
);

/**
 * I campi di testo affiancati (problema e assistenza effettuata; materiali e note) hanno la stessa
 * altezza, quella del più alto. Un `Textarea` si dimensiona sul contenuto (`field-sizing-content`),
 * placeholder compreso: quello delle note è lungo e andava a capo, e il campo accanto restava
 * più basso. Il campo si stende sull'altezza della riga (`self-stretch`) e la sua riga di
 * controllo prende lo spazio che resta (`grid-rows-[auto_1fr]`), dove il `Textarea` si allarga
 * da solo perché non ha un'altezza sua.
 */
const stretchedTextFieldClassName = "gap-1 self-stretch grid-rows-[auto_1fr]";

const InterventionProblemField = ({ values, errors, onChange }: FieldsProps) => (
    <FormField
        labelSize="sm"
        id="problem"
        label="Problema"
        className={stretchedTextFieldClassName}
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
);

const InterventionDescriptionField = ({ values, errors, onChange }: FieldsProps) => (
    <FormField
        labelSize="sm"
        id="description"
        label={interventionDescriptionLabel(values.type)}
        className={stretchedTextFieldClassName}
        required={isCompletedInterventionStatus(values.status)}
        error={errors.description}
    >
        <Textarea
            {...fieldProps("description", { error: errors.description })}
            className="resize-none"
            rows={4}
            placeholder={
                values.type === "material_delivery"
                    ? "Elenca i materiali da consegnare"
                    : "Descrivi l'assistenza effettuata"
            }
            value={values.description}
            onChange={(event) => onChange({ description: event.target.value })}
        />
    </FormField>
);

const InterventionNoteField = ({
    values,
    onChange,
    className,
}: Pick<FieldsProps, "values" | "onChange"> & { className?: string }) => (
    <FormField labelSize="sm" id="note" label="Note" className={cn(stretchedTextFieldClassName, className)}>
        <Textarea
            id="note"
            className="resize-none"
            rows={4}
            placeholder="Annotazioni libere: accordi col cliente, promemoria, materiale da riportare"
            value={values.note}
            onChange={(event) => onChange({ note: event.target.value })}
        />
    </FormField>
);

const InterventionPriceField = ({ values, errors, onChange }: FieldsProps) => (
    <FormField labelSize="sm" id="price" label="Prezzo" className="gap-1" error={errors.price}>
        <EuroInput
            {...fieldProps("price", { error: errors.price })}
            value={values.price}
            onChange={(event) => onChange({ price: event.target.value })}
        />
    </FormField>
);

/**
 * Pagamento e fatturazione sono gruppi di radio, senza un controllo unico a cui legare
 * l'etichetta (si chiamano da sé con `ariaLabel`): la scritta è solo visiva, nella stessa misura
 * delle etichette dei campi accanto.
 */
const InterventionChoiceField = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid gap-1">
        <Label className="text-sm">{label}</Label>
        {children}
    </div>
);

const InterventionPaidField = ({ values, onChange }: Pick<FieldsProps, "values" | "onChange">) => (
    <InterventionChoiceField label="Pagamento">
        <PaidStatusSelector value={values.paid} onValueChange={(paid) => onChange({ paid })} orientation="stacked" />
    </InterventionChoiceField>
);

const InterventionInvoiceField = ({ values, onChange }: Pick<FieldsProps, "values" | "onChange">) => (
    <InterventionChoiceField label="Fatturazione">
        <ToInvoiceSelector
            value={values.toInvoice}
            onValueChange={(toInvoice) => onChange({ toInvoice })}
            orientation="stacked"
        />
    </InterventionChoiceField>
);

/**
 * Il riquadro tinto con l'avanzamento della pratica, a destra da `lg` in su: stato, prezzo,
 * pagamento e fatturazione, le parti che si toccano a ogni chiusura e che a 1280×720 restavano
 * sotto la piega. Lo stato decide gli obblighi di orari e assistenza effettuata, che stanno
 * nell'altra colonna.
 */
export const InterventionProgressSection = (props: FieldsProps) => (
    <FormSection title="Stato e pagamento" className={tintedSectionClassName}>
        <div className="grid items-start gap-4">
            <InterventionStatusField {...props} />
            <InterventionPriceField {...props} />
            <InterventionPaidField {...props} />
            <InterventionInvoiceField {...props} />
        </div>
    </FormSection>
);

/**
 * La sezione "Intervento". Con `part` ne mostra una parte sola, per i passi del dialogo di
 * creazione su telefono (lì Stato sta in "Pianificazione", prezzo e pagamento in "Pagamento").
 * Con `withoutProgress` toglie stato, prezzo, pagamento e fatturazione, che da `lg` stanno nel
 * riquadro `InterventionProgressSection` accanto. Senza nessuno dei due è la sezione intera.
 */
export const InterventionDetailsSection = ({
    values,
    errors,
    onChange,
    part,
    withoutProgress = false,
}: FieldsProps & { part?: InterventionDetailsPart; withoutProgress?: boolean }) => {
    const shows = (fieldPart: InterventionDetailsPart) => part == null || part === fieldPart;
    const common = { values, errors, onChange };
    const isAssistance = isAssistanceInterventionType(values.type);

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
                        <InterventionTypeField {...common} />
                        {withoutProgress ? null : <InterventionStatusField {...common} />}
                        <InterventionDateField {...common} />
                    </>
                ) : null}

                {!withoutProgress && shows("payment") ? (
                    <>
                        <InterventionPriceField {...common} />
                        <InterventionPaidField {...common} />
                        <InterventionInvoiceField {...common} />
                    </>
                ) : null}

                {isAssistance && shows("schedule") ? <InterventionTimeFields {...common} /> : null}

                {/*
                    Problema e assistenza effettuata affiancati, le note sotto a tutta larghezza;
                    senza problema (consegna materiale) le note stanno accanto al lavoro svolto.
                */}
                {isAssistance && shows("work") ? <InterventionProblemField {...common} /> : null}

                {shows("work") ? (
                    <>
                        <InterventionDescriptionField {...common} />
                        <InterventionNoteField
                            {...common}
                            className={isAssistance ? "self-auto lg:col-span-2" : undefined}
                        />
                    </>
                ) : null}
            </div>
        </FormSection>
    );
};
