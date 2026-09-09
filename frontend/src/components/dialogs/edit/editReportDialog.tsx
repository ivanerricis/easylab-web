import CustomDialog from "@/components/dialogs/customDialog";
import { FieldError } from "@/components/form-field";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PaymentMethodSelector from "@/components/payment-method-selector";
import {
    getApiErrorMessage,
    getReport,
    listCollaborators,
    listDevices,
    listIssues,
    listReportTechnicians,
    listTechnicians,
} from "@/lib/api";
import { isCatchAllIssue } from "@/lib/issues";
import type { CollaboratorDto, DeviceDto, IssueDto, PaymentMethod, TechnicianDto } from "@/types/dtos";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

const formatPersonName = (firstName: string, lastName: string | null) => `${firstName} ${lastName ?? ""}`.trim();

type EditReportDialogProps = {
    open: boolean;
    reportId: number | null;
    customerName: string;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: EditReportSubmitValues) => Promise<void>;
};

export type EditReportSubmitValues = {
    reportId: number;
    customerId: number;
    deviceId: number;
    issueId: number;
    collaboratorId: number | null;
    technicianId: number | null;
    existingTechnicianId: number | null;
    technicianPrice: number;
    /**
     * Il problema riscontrato, che è quello stampato sulla ricevuta. Vale solo con il
     * difetto "Altro"; con qualunque altra voce viene azzerato, perché l'etichetta del
     * catalogo dice già tutto.
     */
    issueDescription: string | null;
    serviceDescription: string | null;
    note: string | null;
    password: string | null;
    paymentMethod: PaymentMethod;
    dataBackup: boolean;
    charger: boolean;
    alerted: boolean;
    closed: boolean;
    internalPrice: number;
};

type FieldErrors = Partial<
    Record<"deviceId" | "issueId" | "issueDescription" | "collaboratorId" | "technicianPrice" | "internalPrice", string>
>;

/** L'ordine in cui i campi stanno nel dialogo: decide su quale si posa il focus. */
const fieldOrder = [
    "deviceId",
    "issueId",
    "issueDescription",
    "collaboratorId",
    "technicianPrice",
    "internalPrice",
] as const;

const EditReportDialog = ({ open, reportId, customerName, onOpenChange, onSubmit }: EditReportDialogProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadedReportId, setLoadedReportId] = useState<number | null>(null);
    const [devices, setDevices] = useState<DeviceDto[]>([]);
    const [issues, setIssues] = useState<IssueDto[]>([]);
    const [collaborators, setCollaborators] = useState<CollaboratorDto[]>([]);
    const [technicians, setTechnicians] = useState<TechnicianDto[]>([]);
    const [existingTechnicianId, setExistingTechnicianId] = useState<number | null>(null);

    const [formValues, setFormValues] = useState({
        customerId: "",
        deviceId: "",
        issueId: "",
        collaboratorId: "none",
        technicianId: "none",
        technicianPrice: "0",
        issueDescription: "",
        serviceDescription: "",
        note: "",
        password: "",
        paymentMethod: "non_paid" as PaymentMethod,
        internalPrice: "0",
        dataBackup: false,
        charger: false,
        alerted: false,
        closed: false,
    });

    useEffect(() => {
        if (!open || !reportId) {
            return;
        }

        startTransition(() => {
            setErrors({});
            setLoadedReportId(null);
        });

        const loadData = async () => {
            setIsLoading(true);
            try {
                const [report, devicesData, issuesData, collaboratorsData, techniciansData, reportTechnicians] =
                    await Promise.all([
                        getReport(reportId),
                        listDevices(),
                        listIssues(),
                        listCollaborators(),
                        listTechnicians(),
                        listReportTechnicians(),
                    ]);

                const reportTechnician = reportTechnicians.find((item) => item.reportId === report.id) ?? null;

                setDevices(devicesData);
                setIssues(issuesData);
                setCollaborators(collaboratorsData);
                setTechnicians(techniciansData);
                setExistingTechnicianId(reportTechnician?.technicianId ?? null);
                setFormValues({
                    customerId: String(report.customerId),
                    deviceId: String(report.deviceId),
                    issueId: String(report.issueId),
                    collaboratorId: report.collaboratorId ? String(report.collaboratorId) : "none",
                    technicianId: reportTechnician ? String(reportTechnician.technicianId) : "none",
                    technicianPrice: String(reportTechnician?.price ?? 0),
                    issueDescription: report.issueDescription ?? "",
                    serviceDescription: report.serviceDescription ?? "",
                    note: report.note ?? "",
                    password: report.password ?? "",
                    paymentMethod: report.paymentMethod,
                    internalPrice: String(report.price),
                    dataBackup: report.dataBackup,
                    charger: report.charger,
                    alerted: report.alerted,
                    closed: report.closed,
                });
                setLoadedReportId(report.id);
            } catch (error) {
                toast.error(getApiErrorMessage(error, "Impossibile caricare i dati del report"));
                onOpenChange(false);
            } finally {
                setIsLoading(false);
            }
        };

        startTransition(() => {
            void loadData();
        });
    }, [open, reportId, onOpenChange]);

    // Il problema in chiaro esiste solo con "Altro": è lì che l'etichetta del catalogo non
    // dice niente a chi legge la ricevuta. Vedi lib/issues.ts.
    const selectedIssue = issues.find((issue) => String(issue.id) === formValues.issueId);
    const needsProblemText = isCatchAllIssue(selectedIssue?.description);

    const handleConfirm = async () => {
        if (!reportId || isSubmitting || isLoading) {
            return;
        }

        const customerId = Number(formValues.customerId);
        const deviceId = Number(formValues.deviceId);
        const issueId = Number(formValues.issueId);
        const collaboratorId = formValues.collaboratorId === "none" ? null : Number(formValues.collaboratorId);
        const technicianId = formValues.technicianId === "none" ? null : Number(formValues.technicianId);
        const technicianPrice = Number(formValues.technicianPrice);
        const internalPrice = Number(formValues.internalPrice);

        // Tutti gli errori in una passata, ciascuno accanto al proprio campo: prima ogni
        // controllo usciva dalla funzione con un toast, quindi su un form da dodici campi si
        // scopriva un problema per salvataggio e il messaggio non diceva dove guardare.
        const nextErrors: FieldErrors = {};

        if (!Number.isInteger(deviceId) || deviceId <= 0) {
            nextErrors.deviceId = "Seleziona un dispositivo valido";
        }

        if (!Number.isInteger(issueId) || issueId <= 0) {
            nextErrors.issueId = "Seleziona un difetto valido";
        }

        if (needsProblemText && formValues.issueDescription.trim() === "") {
            nextErrors.issueDescription = 'Con il difetto "Altro" va descritto il problema';
        }

        // Un report chiuso senza collaboratore non dice chi l'ha lavorato: il vincolo vale
        // solo sulla chiusura, quindi il campo resta facoltativo finché il report è aperto.
        if (formValues.closed && collaboratorId == null) {
            nextErrors.collaboratorId = "Per chiudere un report è necessario selezionare un collaboratore";
        }

        if (!Number.isFinite(technicianPrice) || technicianPrice < 0) {
            nextErrors.technicianPrice = "Il prezzo del tecnico deve essere maggiore o uguale a zero";
        }

        if (!Number.isFinite(internalPrice) || internalPrice < 0) {
            nextErrors.internalPrice = "Il prezzo interno deve essere maggiore o uguale a zero";
        } else if (formValues.paymentMethod !== "non_paid" && internalPrice <= 0) {
            nextErrors.internalPrice = "Se il pagamento è in contanti o con carta, il prezzo deve essere maggiore di 0";
        }

        setErrors(nextErrors);

        const firstInvalidField = fieldOrder.find((field) => nextErrors[field]);

        if (firstInvalidField) {
            document.getElementById(firstInvalidField)?.focus();
            return;
        }

        // Il cliente non è modificabile da qui (il suo campo è disabilitato): se l'id non è
        // valido il problema non è di un campo, è del report che si sta aprendo.
        if (!Number.isInteger(customerId) || customerId <= 0) {
            toast.error("Seleziona un cliente valido");
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({
                reportId,
                customerId,
                deviceId,
                issueId,
                collaboratorId,
                technicianId,
                existingTechnicianId,
                technicianPrice,
                issueDescription: needsProblemText ? formValues.issueDescription.trim() : null,
                serviceDescription: formValues.serviceDescription.trim() || null,
                note: formValues.note.trim() || null,
                password: formValues.password.trim() || null,
                paymentMethod: formValues.paymentMethod,
                dataBackup: formValues.dataBackup,
                charger: formValues.charger,
                alerted: formValues.alerted,
                closed: formValues.closed,
                internalPrice,
            });

            toast.success("Report aggiornato con successo");
            onOpenChange(false);
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile aggiornare il report"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CustomDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Modifica report"
            contentClassName="sm:max-w-4xl lg:max-w-6xl xl:max-w-[88rem]"
            preventOutsideClose
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            cancelLabel="Annulla"
            onCancel={() => onOpenChange(false)}
            onConfirm={() => void handleConfirm()}
            cancelDisabled={isSubmitting || isLoading}
            confirmDisabled={isSubmitting || isLoading}
            content={
                <div className="grid gap-4 py-4">
                    {isLoading || loadedReportId !== reportId ? (
                        <div className="rounded-md border border-dashed border-primary/20 bg-muted/30 px-4 py-8 text-center text-muted-foreground">
                            Caricamento dati del report...
                        </div>
                    ) : (
                        <div className="grid max-h-[70vh] gap-2 overflow-y-auto pr-1">
                            <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                        Anagrafica
                                    </h3>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                                    <div className="grid gap-1">
                                        <Label htmlFor="customerId" className="text-lg">
                                            Cliente
                                        </Label>
                                        <Select disabled value={formValues.customerId}>
                                            <SelectTrigger id="customerId" className="w-full">
                                                <SelectValue placeholder={customerName} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={formValues.customerId}>{customerName}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid gap-1">
                                        <Label htmlFor="deviceId" className="text-lg">
                                            Dispositivo
                                        </Label>
                                        <Select
                                            value={formValues.deviceId}
                                            onValueChange={(value) => {
                                                setFormValues((prev) => ({ ...prev, deviceId: value }));
                                                setErrors((prev) => ({ ...prev, deviceId: undefined }));
                                            }}
                                        >
                                            <SelectTrigger
                                                id="deviceId"
                                                {...fieldErrorAria("deviceId", errors.deviceId)}
                                                className="w-full"
                                            >
                                                <SelectValue placeholder="Seleziona dispositivo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {devices.map((device) => (
                                                    <SelectItem key={device.id} value={String(device.id)}>
                                                        {device.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FieldError id="deviceId" error={errors.deviceId} />
                                    </div>

                                    <div className="grid gap-1">
                                        <Label htmlFor="issueId" className="text-lg">
                                            Difetto catalogo
                                        </Label>
                                        <Select
                                            value={formValues.issueId}
                                            onValueChange={(value) => {
                                                setFormValues((prev) => ({ ...prev, issueId: value }));
                                                setErrors((prev) => ({ ...prev, issueId: undefined }));
                                            }}
                                        >
                                            <SelectTrigger
                                                id="issueId"
                                                {...fieldErrorAria("issueId", errors.issueId)}
                                                className="w-full"
                                            >
                                                <SelectValue placeholder="Seleziona difetto" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {issues.map((issue) => (
                                                    <SelectItem key={issue.id} value={String(issue.id)}>
                                                        {issue.description}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FieldError id="issueId" error={errors.issueId} />
                                    </div>

                                    {needsProblemText ? (
                                        <div className="grid gap-1">
                                            <Label htmlFor="issueDescription" className="text-lg">
                                                Problema riscontrato
                                            </Label>
                                            <Textarea
                                                {...fieldProps("issueDescription", {
                                                    error: errors.issueDescription,
                                                })}
                                                placeholder="Quello che il cliente legge sulla ricevuta"
                                                maxLength={255}
                                                value={formValues.issueDescription}
                                                onChange={(event) => {
                                                    setFormValues((prev) => ({
                                                        ...prev,
                                                        issueDescription: event.target.value,
                                                    }));
                                                    setErrors((prev) => ({ ...prev, issueDescription: undefined }));
                                                }}
                                            />
                                            <FieldError id="issueDescription" error={errors.issueDescription} />
                                        </div>
                                    ) : null}

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
                                                <SelectValue placeholder="Nessun collaboratore" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Nessuno</SelectItem>
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
                                        <FieldError id="collaboratorId" error={errors.collaboratorId} />
                                    </div>
                                </div>
                            </section>

                            <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                        Intervento
                                    </h3>
                                </div>

                                <div className="grid gap-4">
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div className="grid gap-1">
                                            <Label htmlFor="serviceDescription" className="text-lg">
                                                Descrizione intervento
                                            </Label>
                                            <Textarea
                                                id="serviceDescription"
                                                className="resize-none text-lg!"
                                                placeholder="Descrivi l'intervento"
                                                rows={4}
                                                value={formValues.serviceDescription}
                                                onChange={(event) =>
                                                    setFormValues((prev) => ({
                                                        ...prev,
                                                        serviceDescription: event.target.value,
                                                    }))
                                                }
                                            />
                                        </div>

                                        <div className="grid gap-1">
                                            <Label htmlFor="note" className="text-lg">
                                                Note
                                            </Label>
                                            <Textarea
                                                id="note"
                                                className="resize-none text-lg!"
                                                placeholder="Note"
                                                rows={4}
                                                value={formValues.note}
                                                onChange={(event) =>
                                                    setFormValues((prev) => ({ ...prev, note: event.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                        <div className="grid gap-1">
                                            <Label htmlFor="password" className="text-lg">
                                                Password sblocco
                                            </Label>
                                            <Input
                                                id="password"
                                                className="text-lg!"
                                                placeholder="Password dispositivo"
                                                value={formValues.password}
                                                onChange={(event) =>
                                                    setFormValues((prev) => ({ ...prev, password: event.target.value }))
                                                }
                                            />
                                        </div>

                                        <div className="grid gap-1">
                                            <Label htmlFor="technicianId" className="text-lg">
                                                Tecnico esterno
                                            </Label>
                                            <Select
                                                value={formValues.technicianId}
                                                onValueChange={(value) =>
                                                    setFormValues((prev) => ({ ...prev, technicianId: value }))
                                                }
                                            >
                                                <SelectTrigger id="technicianId" className="w-full">
                                                    <SelectValue placeholder="Nessun tecnico" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Nessuno</SelectItem>
                                                    {technicians.map((technician) => (
                                                        <SelectItem key={technician.id} value={String(technician.id)}>
                                                            {formatPersonName(
                                                                technician.firstName,
                                                                technician.lastName
                                                            )}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-1">
                                            <Label htmlFor="technicianPrice" className="text-lg">
                                                Prezzo lavoro tecnico
                                            </Label>
                                            <Input
                                                {...fieldProps("technicianPrice", { error: errors.technicianPrice })}
                                                className="text-lg!"
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={formValues.technicianPrice}
                                                onChange={(event) => {
                                                    setFormValues((prev) => ({
                                                        ...prev,
                                                        technicianPrice: event.target.value,
                                                    }));
                                                    setErrors((prev) => ({ ...prev, technicianPrice: undefined }));
                                                }}
                                            />
                                            <FieldError id="technicianPrice" error={errors.technicianPrice} />
                                        </div>

                                        <div className="grid gap-1">
                                            <Label htmlFor="internalPrice" className="text-lg">
                                                Prezzo interno
                                            </Label>
                                            <Input
                                                {...fieldProps("internalPrice", { error: errors.internalPrice })}
                                                className="text-lg!"
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={formValues.internalPrice}
                                                onChange={(event) => {
                                                    setFormValues((prev) => ({
                                                        ...prev,
                                                        internalPrice: event.target.value,
                                                    }));
                                                    setErrors((prev) => ({ ...prev, internalPrice: undefined }));
                                                }}
                                            />
                                            <FieldError id="internalPrice" error={errors.internalPrice} />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                                <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                            Stato
                                        </h3>
                                    </div>

                                    <div className="grid gap-3 lg:grid-cols-2">
                                        <div className="flex w-full items-center gap-3 rounded-md border border-primary/15 bg-background px-3 py-2">
                                            <Checkbox
                                                id="charger"
                                                className="size-5"
                                                checked={formValues.charger}
                                                onCheckedChange={(checked) =>
                                                    setFormValues((prev) => ({ ...prev, charger: checked === true }))
                                                }
                                            />
                                            <Label htmlFor="charger" className="w-full cursor-pointer text-lg">
                                                Alimentatore presente
                                            </Label>
                                        </div>

                                        <div className="flex w-full items-center gap-3 rounded-md border border-primary/15 bg-background px-3 py-2">
                                            <Checkbox
                                                id="alerted"
                                                className="size-5"
                                                checked={formValues.alerted}
                                                onCheckedChange={(checked) =>
                                                    setFormValues((prev) => ({ ...prev, alerted: checked === true }))
                                                }
                                            />
                                            <Label htmlFor="alerted" className="w-full cursor-pointer text-lg">
                                                Avvisato
                                            </Label>
                                        </div>

                                        <div className="flex w-full items-center gap-3 rounded-md border border-primary/15 bg-background px-3 py-2">
                                            <Checkbox
                                                id="dataBackup"
                                                className="size-5"
                                                checked={formValues.dataBackup}
                                                onCheckedChange={(checked) =>
                                                    setFormValues((prev) => ({ ...prev, dataBackup: checked === true }))
                                                }
                                            />
                                            <Label htmlFor="dataBackup" className="w-full cursor-pointer text-lg">
                                                Backup dati
                                            </Label>
                                        </div>

                                        <div className="flex w-full items-center gap-3 rounded-md border border-primary/15 bg-background px-3 py-2">
                                            <Checkbox
                                                id="closed"
                                                className="size-5"
                                                checked={formValues.closed}
                                                onCheckedChange={(checked) =>
                                                    setFormValues((prev) => ({ ...prev, closed: checked === true }))
                                                }
                                            />
                                            <Label htmlFor="closed" className="w-full cursor-pointer text-lg">
                                                Report chiuso
                                            </Label>
                                        </div>
                                    </div>
                                </section>

                                <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                                    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                        Pagamento
                                    </h3>

                                    <PaymentMethodSelector
                                        value={formValues.paymentMethod}
                                        onValueChange={(paymentMethod) =>
                                            setFormValues((prev) => ({
                                                ...prev,
                                                paymentMethod,
                                                internalPrice: paymentMethod === "non_paid" ? "0" : prev.internalPrice,
                                            }))
                                        }
                                        className="grid-cols-1"
                                    />
                                </section>
                            </div>
                        </div>
                    )}
                </div>
            }
        />
    );
};

export default EditReportDialog;
