import CustomDialog from "@/components/dialogs/customDialog";
import { FieldError, RequiredMark } from "@/components/form-field";
import { fieldErrorAria, fieldProps } from "@/lib/formField";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PaymentMethodSelector from "@/components/payment-method-selector";
import { getApiErrorMessage, getReport, listCollaborators, listDevices, listIssues, listTechnicians } from "@/lib/api";
import { isCatchAllIssue } from "@/lib/issues";
import { cn } from "@/lib/utils";
import type { CollaboratorDto, DeviceDto, IssueDto, PaymentMethod, TechnicianDto } from "@/types/dtos";
import { startTransition, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";

const formatPersonName = (firstName: string, lastName: string | null) => `${firstName} ${lastName ?? ""}`.trim();

/**
 * Un riquadro del dialogo. `content-start` tiene i campi in alto quando la sezione si allunga
 * per pareggiare le vicine nella riga in fondo: senza, la griglia distribuirebbe lo spazio in
 * più fra le righe e i campi finirebbero sparsi.
 */
const FormSection = ({ title, className, children }: { title: string; className?: string; children: ReactNode }) => (
    <section className={cn("grid content-start gap-3 rounded-md border border-primary/15 bg-muted/20 p-4", className)}>
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {children}
    </section>
);

/** Un campo prezzo con il simbolo dell'euro davanti: prima era un numero nudo. */
const EuroInput = ({ className, ...props }: ComponentProps<typeof Input>) => (
    <div className="relative">
        <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg text-muted-foreground"
        >
            €
        </span>
        <Input type="number" min={0} step={1} className={cn("pl-8 text-lg!", className)} {...props} />
    </div>
);

/**
 * Le spunte di stato, nell'ordine in cui contano: le due dell'accettazione (le stesse del dialogo
 * di creazione), poi le due della riconsegna.
 */
const statusOptions = [
    { id: "charger", label: "Alimentatore presente" },
    { id: "dataBackup", label: "Backup dati" },
    { id: "alerted", label: "Avvisato" },
    { id: "closed", label: "Report chiuso" },
] as const;

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
    "collaboratorId",
    "issueId",
    "issueDescription",
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
                // Il tecnico arriva con il report. Prima si scaricava l'intera tabella
                // report-tecnico (376 KB con 8000 righe, e cresce con l'archivio) per trovarne una.
                const [report, devicesData, issuesData, collaboratorsData, techniciansData] = await Promise.all([
                    getReport(reportId),
                    listDevices(),
                    listIssues(),
                    listCollaborators(),
                    listTechnicians(),
                ]);

                setDevices(devicesData);
                setIssues(issuesData);
                setCollaborators(collaboratorsData);
                setTechnicians(techniciansData);
                setExistingTechnicianId(report.technicianId);
                setFormValues({
                    customerId: String(report.customerId),
                    deviceId: String(report.deviceId),
                    issueId: String(report.issueId),
                    collaboratorId: report.collaboratorId ? String(report.collaboratorId) : "none",
                    technicianId: report.technicianId != null ? String(report.technicianId) : "none",
                    technicianPrice: String(report.technicianPrice),
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
            title={reportId ? `Modifica report #${reportId}` : "Modifica report"}
            contentClassName="sm:max-w-2xl lg:max-w-5xl xl:max-w-6xl"
            preventOutsideClose
            confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
            confirmIcon={Save}
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
                        // L'altezza segue lo schermo invece di un 70vh fisso: intestazione e
                        // pulsanti occupano sempre gli stessi pixel, e su un monitor alto il
                        // modulo sta tutto senza barra di scorrimento. Su mobile i pulsanti
                        // vanno uno sotto l'altro, quindi resta un po' più di margine.
                        <div className="grid max-h-[calc(100dvh-15rem)] gap-4 overflow-y-auto pr-1 sm:max-h-[calc(100dvh-12rem)]">
                            <FormSection title="Anagrafica">
                                {/*
                                    `items-start` in tutte le griglie di campi: quando un campo
                                    mostra l'errore sotto di sé la riga si allunga, e senza le celle
                                    vicine si stiravano con lei spingendo in giù le etichette.
                                */}
                                <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                                            <RequiredMark />
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

                                    <div className="grid gap-1 sm:col-span-2 lg:col-span-1">
                                        <Label htmlFor="collaboratorId" className="text-lg">
                                            Collaboratore
                                            {formValues.closed ? <RequiredMark /> : null}
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
                            </FormSection>

                            <FormSection title="Intervento">
                                <div className="grid items-start gap-4 sm:grid-cols-2">
                                    {/*
                                        Il difetto ha almeno mezza riga e non un quarto: è la voce
                                        con il testo più lungo del modulo, e in un quarto di riga le
                                        descrizioni del catalogo arrivavano troncate. Sotto lg anche
                                        mezza riga non basta, quindi lì la prende tutta (e la
                                        password con lui, per non lasciare mezza riga vuota).
                                    */}
                                    <div className="grid gap-1 sm:col-span-2 lg:col-span-1">
                                        <Label htmlFor="issueId" className="text-lg">
                                            Difetto catalogo
                                            <RequiredMark />
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

                                    <div className="grid gap-1 sm:col-span-2 lg:col-span-1">
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

                                    {needsProblemText ? (
                                        <div className="grid gap-1 sm:col-span-2">
                                            <Label htmlFor="issueDescription" className="text-lg">
                                                Problema riscontrato
                                                <RequiredMark />
                                            </Label>
                                            <Textarea
                                                {...fieldProps("issueDescription", {
                                                    error: errors.issueDescription,
                                                })}
                                                className="text-lg!"
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
                                        <Label htmlFor="serviceDescription" className="text-lg">
                                            Descrizione intervento
                                        </Label>
                                        <Textarea
                                            id="serviceDescription"
                                            className="min-h-24 resize-none text-lg!"
                                            placeholder="Descrivi l'intervento"
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
                                            className="min-h-24 resize-none text-lg!"
                                            placeholder="Note"
                                            value={formValues.note}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, note: event.target.value }))
                                            }
                                        />
                                    </div>
                                </div>
                            </FormSection>

                            {/*
                                Tre riquadri affiancati da lg in su, alti uguali: dentro, i campi
                                tornano uno sotto l'altro perché la colonna è stretta. Sotto lg i
                                riquadri si impilano e i campi si rimettono in riga.
                            */}
                            <div className="grid gap-4 lg:grid-cols-3">
                                <FormSection title="Tecnico esterno">
                                    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                        <div className="grid gap-1">
                                            <Label htmlFor="technicianId" className="text-lg">
                                                Tecnico
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
                                            <EuroInput
                                                {...fieldProps("technicianPrice", { error: errors.technicianPrice })}
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
                                    </div>
                                </FormSection>

                                {/*
                                    Prezzo e metodo stanno nello stesso riquadro perché dipendono
                                    l'uno dall'altro: "Non pagato" riporta il prezzo a zero, e con
                                    contanti o carta il prezzo non può restare a zero.
                                */}
                                <FormSection title="Pagamento">
                                    <div className="grid gap-1">
                                        <Label htmlFor="internalPrice" className="text-lg">
                                            Prezzo interno
                                        </Label>
                                        <EuroInput
                                            {...fieldProps("internalPrice", { error: errors.internalPrice })}
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

                                    <PaymentMethodSelector
                                        value={formValues.paymentMethod}
                                        onValueChange={(paymentMethod) => {
                                            setFormValues((prev) => ({
                                                ...prev,
                                                paymentMethod,
                                                internalPrice: paymentMethod === "non_paid" ? "0" : prev.internalPrice,
                                            }));
                                            setErrors((prev) => ({ ...prev, internalPrice: undefined }));
                                        }}
                                        className="lg:grid-cols-1"
                                    />
                                </FormSection>

                                <FormSection title="Stato">
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                                        {statusOptions.map((option) => (
                                            // Tutto il riquadro è l'etichetta, quindi tutto il
                                            // riquadro è cliccabile: prima lo era solo la scritta,
                                            // e un clic sul bordo interno andava a vuoto.
                                            <Label
                                                key={option.id}
                                                htmlFor={option.id}
                                                className="w-full cursor-pointer gap-3 rounded-md border border-primary/15 bg-background px-3 py-2.5 text-lg transition-colors hover:bg-muted/60 has-[[aria-checked=true]]:border-primary/50 has-[[aria-checked=true]]:bg-primary/5"
                                            >
                                                <Checkbox
                                                    id={option.id}
                                                    className="size-5"
                                                    checked={formValues[option.id]}
                                                    onCheckedChange={(checked) =>
                                                        setFormValues((prev) => ({
                                                            ...prev,
                                                            [option.id]: checked === true,
                                                        }))
                                                    }
                                                />
                                                {option.label}
                                            </Label>
                                        ))}
                                    </div>
                                </FormSection>
                            </div>
                        </div>
                    )}
                </div>
            }
        />
    );
};

export default EditReportDialog;
