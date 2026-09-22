import CustomDialog from "@/components/dialogs/customDialog";
import {
    InterventionCollaboratorField,
    InterventionDetailsSection,
} from "@/components/dialogs/intervention-form-fields";
import { hasFormChanged } from "@/lib/formField";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiErrorMessage, getIntervention, listCollaborators } from "@/lib/api";
import {
    emptyInterventionFormState,
    interventionFieldOrder,
    toInterventionSubmitFields,
    validateInterventionForm,
    type InterventionFieldErrors,
    type InterventionFormState,
} from "@/lib/interventionForm";
import type { CollaboratorDto, InterventionStatus, InterventionType } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

export type EditInterventionSubmitValues = {
    interventionId: number;
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
    collaboratorId: number;
    interventionDate: string | null;
    startTime: string | null;
    endTime: string | null;
};

type EditInterventionDialogProps = {
    open: boolean;
    interventionId: number | null;
    customerName: string;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: EditInterventionSubmitValues) => Promise<void>;
};

const EditInterventionDialog = ({
    open,
    interventionId,
    customerName,
    onOpenChange,
    onSubmit,
}: EditInterventionDialogProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<InterventionFieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadedInterventionId, setLoadedInterventionId] = useState<number | null>(null);
    const [collaborators, setCollaborators] = useState<CollaboratorDto[]>([]);

    const [formValues, setFormValues] = useState<InterventionFormState>(() => emptyInterventionFormState(""));

    // I valori come sono arrivati dal server: finché non ci sono (caricamento), il modulo non
    // può essere "modificato", e chiudere non chiede niente.
    const [savedFormValues, setSavedFormValues] = useState<InterventionFormState | null>(null);
    const isDirty =
        loadedInterventionId != null && savedFormValues != null && hasFormChanged(formValues, savedFormValues);

    /** Applica i campi cambiati e toglie l'errore a quelli toccati. */
    const handleChange = (patch: Partial<InterventionFormState>) => {
        setFormValues((prev) => ({ ...prev, ...patch }));
        setErrors((prev) => {
            const next = { ...prev };
            for (const field of Object.keys(patch)) {
                delete next[field as keyof InterventionFieldErrors];
            }
            return next;
        });
    };

    useEffect(() => {
        if (!open || !interventionId) {
            return;
        }

        startTransition(() => {
            setErrors({});
            setLoadedInterventionId(null);
        });

        const loadData = async () => {
            setIsLoading(true);
            try {
                const [intervention, collaboratorsData] = await Promise.all([
                    getIntervention(interventionId),
                    listCollaborators(),
                ]);

                setCollaborators(collaboratorsData);
                const loadedFormValues: InterventionFormState = {
                    type: intervention.type,
                    status: intervention.status,
                    description: intervention.description ?? "",
                    problem: intervention.problem ?? "",
                    note: intervention.note ?? "",
                    price: intervention.price != null ? String(intervention.price) : "",
                    paid: intervention.paid,
                    toInvoice: intervention.toInvoice,
                    collaboratorId: String(intervention.collaboratorId),
                    interventionDate: intervention.interventionDate ?? "",
                    startTime: intervention.startTime?.slice(0, 5) ?? "",
                    endTime: intervention.endTime?.slice(0, 5) ?? "",
                };
                setFormValues(loadedFormValues);
                setSavedFormValues(loadedFormValues);
                setLoadedInterventionId(intervention.id);
            } catch (error) {
                toast.error(getApiErrorMessage(error, "Impossibile caricare i dati dell'intervento"));
                onOpenChange(false);
            } finally {
                setIsLoading(false);
            }
        };

        startTransition(() => {
            void loadData();
        });
    }, [open, interventionId, onOpenChange]);

    const handleConfirm = async () => {
        if (!interventionId || isSubmitting || isLoading) {
            return;
        }

        // Tutti gli errori in un colpo solo, ciascuno accanto al proprio campo: prima ogni
        // controllo usciva dalla funzione con un toast, che non diceva quale campo correggere.
        const nextErrors = validateInterventionForm(formValues);

        setErrors(nextErrors);

        const firstInvalidField = interventionFieldOrder.find((field) => nextErrors[field]);

        if (firstInvalidField) {
            document.getElementById(firstInvalidField)?.focus();
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({ interventionId, ...toInterventionSubmitFields(formValues) });

            toast.success("Intervento aggiornato con successo");
            onOpenChange(false);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile aggiornare l'intervento"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={onOpenChange}
            isDirty={isDirty}
            title={interventionId ? `Modifica intervento #${interventionId}` : "Modifica intervento"}
            contentClassName="sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl"
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            confirmIcon={Save}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting || isLoading}
            confirmDisabled={isSubmitting || isLoading}
            content={
                <div className="grid gap-4 py-4">
                    {isLoading || loadedInterventionId !== interventionId ? (
                        <div className="rounded-md border border-dashed border-primary/20 bg-muted/30 px-4 py-8 text-center text-muted-foreground">
                            Caricamento dati dell'intervento...
                        </div>
                    ) : (
                        <div className="grid max-h-[70vh] gap-2 overflow-y-auto pr-1">
                            <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                    Anagrafica
                                </h3>

                                {/*
                                    `items-start` in tutte le griglie di campi: quando un campo
                                    mostra l'errore sotto di sé la riga si allunga, e senza le celle
                                    vicine si stiravano con lei spingendo in giù etichetta e campo.
                                */}
                                <div className="grid items-start gap-4 lg:grid-cols-2">
                                    <div className="grid gap-1">
                                        <Label htmlFor="customerName" className="text-lg">
                                            Cliente
                                        </Label>
                                        <Select disabled value={customerName}>
                                            <SelectTrigger id="customerName" className="w-full">
                                                <SelectValue placeholder={customerName} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={customerName}>{customerName}</SelectItem>
                                            </SelectContent>
                                        </Select>
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
                    )}
                </div>
            }
        />
    );
};

export default EditInterventionDialog;
