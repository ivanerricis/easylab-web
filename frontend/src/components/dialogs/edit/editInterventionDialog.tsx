import CustomDialog from "@/components/dialogs/customDialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DatePickerField from "@/components/date-picker-field";
import { getApiErrorMessage, getIntervention, listCollaborators } from "@/lib/api";
import {
    getInterventionValidationError,
    interventionDateLabel,
    interventionDescriptionLabel,
    interventionStatusOptions,
    interventionTypeOptions,
    isOnSiteInterventionType,
    isScheduledInterventionStatus,
} from "@/lib/interventions";
import type { CollaboratorDto, InterventionStatus, InterventionType } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

const formatPersonName = (firstName: string, lastName: string | null) => `${firstName} ${lastName ?? ""}`.trim();

export type EditInterventionSubmitValues = {
    interventionId: number;
    type: InterventionType;
    status: InterventionStatus;
    /** `null` quando l'intervento è solo programmato: il lavoro non è ancora stato svolto. */
    description: string | null;
    problem: string | null;
    note: string | null;
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadedInterventionId, setLoadedInterventionId] = useState<number | null>(null);
    const [collaborators, setCollaborators] = useState<CollaboratorDto[]>([]);

    const [formValues, setFormValues] = useState({
        type: "consegna_materiale" as InterventionType,
        status: "programmato" as InterventionStatus,
        description: "",
        problem: "",
        note: "",
        collaboratorId: "",
        interventionDate: "",
        startTime: "",
        endTime: "",
    });

    const isOnSite = isOnSiteInterventionType(formValues.type);
    // Un intervento ancora da svolgere non ha orari né lavoro da descrivere: i campi
    // restano compilabili, ma smettono di essere obbligatori e l'etichetta lo dice.
    const isScheduled = isScheduledInterventionStatus(formValues.status);

    useEffect(() => {
        if (!open || !interventionId) {
            return;
        }

        startTransition(() => {
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
                setFormValues({
                    type: intervention.type,
                    status: intervention.status,
                    description: intervention.description ?? "",
                    problem: intervention.problem ?? "",
                    note: intervention.note ?? "",
                    collaboratorId: String(intervention.collaboratorId),
                    interventionDate: intervention.interventionDate ?? "",
                    startTime: intervention.startTime?.slice(0, 5) ?? "",
                    endTime: intervention.endTime?.slice(0, 5) ?? "",
                });
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

        const collaboratorId = Number(formValues.collaboratorId);

        if (!Number.isInteger(collaboratorId) || collaboratorId <= 0) {
            toast.error("Seleziona un collaboratore valido");
            return;
        }

        const validationError = getInterventionValidationError(formValues);

        if (validationError) {
            toast.error(validationError);
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({
                interventionId,
                type: formValues.type,
                status: formValues.status,
                description: formValues.description.trim() || null,
                problem: isOnSite ? formValues.problem.trim() : null,
                note: formValues.note.trim() || null,
                collaboratorId,
                interventionDate: formValues.interventionDate,
                startTime: isOnSite ? formValues.startTime || null : null,
                endTime: isOnSite ? formValues.endTime || null : null,
            });

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
            title="Modifica intervento"
            contentClassName="sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl"
            preventOutsideClose
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
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

                                <div className="grid gap-4 lg:grid-cols-2">
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

                                    <div className="grid gap-1">
                                        <Label htmlFor="collaboratorId" className="text-lg">
                                            Collaboratore
                                        </Label>
                                        <Select
                                            value={formValues.collaboratorId}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => ({ ...prev, collaboratorId: value }))
                                            }
                                        >
                                            <SelectTrigger id="collaboratorId" className="w-full">
                                                <SelectValue placeholder="Seleziona collaboratore" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {collaborators.map((collaborator) => (
                                                    <SelectItem key={collaborator.id} value={String(collaborator.id)}>
                                                        {formatPersonName(
                                                            collaborator.firstName,
                                                            collaborator.lastName
                                                        )}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
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
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    status: value as InterventionStatus,
                                                }))
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
                                            value={formValues.interventionDate}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => ({ ...prev, interventionDate: value }))
                                            }
                                        />
                                    </div>

                                    {isOnSite ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-1">
                                                <Label htmlFor="startTime" className="text-lg">
                                                    Ora inizio
                                                </Label>
                                                <Input
                                                    id="startTime"
                                                    type="time"
                                                    value={formValues.startTime}
                                                    onChange={(event) =>
                                                        setFormValues((prev) => ({
                                                            ...prev,
                                                            startTime: event.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>

                                            <div className="grid gap-1">
                                                <Label htmlFor="endTime" className="text-lg">
                                                    Ora fine
                                                </Label>
                                                <Input
                                                    id="endTime"
                                                    type="time"
                                                    value={formValues.endTime}
                                                    onChange={(event) =>
                                                        setFormValues((prev) => ({
                                                            ...prev,
                                                            endTime: event.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    ) : null}

                                    {isOnSite ? (
                                        <div className="grid gap-1 lg:col-span-2">
                                            <Label htmlFor="problem" className="text-lg">
                                                Problema
                                            </Label>
                                            <Textarea
                                                id="problem"
                                                className="resize-none text-lg!"
                                                rows={4}
                                                placeholder="Descrivi il problema riscontrato"
                                                value={formValues.problem}
                                                onChange={(event) =>
                                                    setFormValues((prev) => ({ ...prev, problem: event.target.value }))
                                                }
                                            />
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
                                            id="description"
                                            className="resize-none text-lg!"
                                            rows={4}
                                            value={formValues.description}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, description: event.target.value }))
                                            }
                                        />
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
                    )}
                </div>
            }
        />
    );
};

export default EditInterventionDialog;
