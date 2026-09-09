import CustomDialog from "@/components/dialogs/customDialog";
import { formatCustomerOption } from "@/lib/customers";
import { isCatchAllIssue } from "@/lib/issues";
import CreateCustomerDialog from "@/components/dialogs/create/createCustomerDialog";
import CreateDeviceDialog from "@/components/dialogs/create/createDeviceDialog";
import CreateIssueDialog from "@/components/dialogs/create/createIssueDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    createCustomer,
    createDevice,
    createIssue,
    getApiErrorMessage,
    listCustomers,
    listDevices,
    listIssues,
} from "@/lib/api";
import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import InputWithAdd from "@/components/inputWithAdd";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { ChangeEvent } from "react";

/**
 * I valori che questo dialogo consegna a chi lo apre.
 *
 * Gli id sono già risolti qui, dai cataloghi caricati all'apertura: restano `null` solo
 * quando il testo scritto non corrisponde a nessuna voce, e in quel caso tocca al chiamante
 * decidere (cercarla di nuovo, o rifiutare).
 */
export type CreateReportSubmitValues = {
    customer: string;
    deviceType: string;
    /** Il difetto scelto dal catalogo, come testo: serve a risolvere `issueId`. */
    issue: string;
    /**
     * Il problema scritto a mano, valorizzato **solo** quando il difetto scelto è "Altro".
     * Con qualunque altra voce l'etichetta del catalogo dice già tutto e questo resta null.
     */
    issueDescription: string | null;
    password: string;
    notes: string;
    charger: boolean;
    dataBackup: boolean;
    customerId: number | null;
    deviceId: number | null;
    issueId: number | null;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: CreateReportSubmitValues) => Promise<void> | void;
};

const CreateReportDialog = ({ open, onOpenChange, onSubmit }: Props) => {
    const [formValues, setFormValues] = useState({
        customer: "",
        deviceType: "",
        issue: "",
        issueDescription: "",
        password: "",
        charger: "unset",
        dataBackup: "unset",
        notes: "",
    });
    const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
    const [isCreateDeviceDialogOpen, setIsCreateDeviceDialogOpen] = useState(false);
    const [isCreateIssueDialogOpen, setIsCreateIssueDialogOpen] = useState(false);
    const [deviceOptions, setDeviceOptions] = useState<string[]>([]);
    const [issueOptions, setIssueOptions] = useState<string[]>([]);
    const [customerIdByOption, setCustomerIdByOption] = useState<Record<string, number>>({});
    const [deviceIdByOption, setDeviceIdByOption] = useState<Record<string, number>>({});
    const [issueIdByOption, setIssueIdByOption] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({
        issue: false,
        issueDescription: false,
        charger: false,
        dataBackup: false,
    });

    useEffect(() => {
        if (open) {
            startTransition(() => {
                setFormValues({
                    customer: "",
                    deviceType: "",
                    issue: "",
                    issueDescription: "",
                    password: "",
                    charger: "unset",
                    dataBackup: "unset",
                    notes: "",
                });
                setFieldErrors({
                    issue: false,
                    issueDescription: false,
                    charger: false,
                    dataBackup: false,
                });
                setCustomerIdByOption({});
                setDeviceIdByOption({});
                setIssueIdByOption({});
            });

            const loadOptions = async () => {
                try {
                    const [devices, issues] = await Promise.all([listDevices(), listIssues()]);

                    setDeviceOptions(devices.map((device) => device.name));
                    setDeviceIdByOption(Object.fromEntries(devices.map((device) => [device.name, device.id])));
                    setIssueOptions(issues.map((issue) => issue.description));
                    setIssueIdByOption(Object.fromEntries(issues.map((issue) => [issue.description, issue.id])));
                } catch (error) {
                    toast.error(getApiErrorMessage(error, "Impossibile caricare i suggerimenti"));
                }
            };

            void loadOptions();
        }
    }, [open]);

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

        // Il difetto deve corrispondere a una voce del catalogo: la casella si scrive per
        // cercare, non per inventare. Per una voce nuova c'è il pulsante "+" qui accanto.
        const issueId = issueIdByOption[formValues.issue.trim()] ?? null;
        const needsProblemText = isCatchAllIssue(formValues.issue);

        const nextFieldErrors = {
            issue: formValues.issue.trim() === "" || issueId == null,
            issueDescription: needsProblemText && formValues.issueDescription.trim() === "",
            charger: formValues.charger === "unset",
            dataBackup: formValues.dataBackup === "unset",
        };

        setFieldErrors(nextFieldErrors);

        if (nextFieldErrors.issue) {
            toast.error(
                formValues.issue.trim() === ""
                    ? "Seleziona un difetto"
                    : "Seleziona un difetto esistente, oppure creane uno nuovo con il pulsante +"
            );
            return;
        }

        if (nextFieldErrors.issueDescription) {
            toast.error('Con il difetto "Altro" va descritto il problema');
            return;
        }

        if (formValues.customer.trim() === "") {
            toast.error("Seleziona un cliente");
            return;
        }

        if (nextFieldErrors.charger) {
            toast.error("Seleziona se l'alimentatore è presente");
            return;
        }

        if (nextFieldErrors.dataBackup) {
            toast.error("Seleziona se deve essere effettuato il backup dati");
            return;
        }

        if (!onSubmit) {
            onOpenChange(false);
            return;
        }

        try {
            setIsSubmitting(true);
            await onSubmit({
                ...formValues,
                customerId: customerIdByOption[formValues.customer] ?? null,
                deviceId: deviceIdByOption[formValues.deviceType] ?? null,
                issueId,
                // Fuori da "Altro" il problema non si scrive: l'etichetta del catalogo basta.
                issueDescription: needsProblemText ? formValues.issueDescription.trim() : null,
                charger: formValues.charger === "yes",
                dataBackup: formValues.dataBackup === "yes",
            });
            onOpenChange(false);
            toast.success("Report creato con successo");
        } catch (error) {
            toast.error(getApiErrorMessage(error, "Impossibile salvare i dati"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <CustomDialog
                open={open}
                onOpenChange={onOpenChange}
                title="Nuovo report"
                description="Inserisci i dati del report e conferma per salvare."
                contentClassName="sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl"
                preventOutsideClose
                confirmLabel={isSubmitting ? "Salvataggio..." : "Salva"}
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

                            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">
                                <div className="grid lg:col-span-1">
                                    <Label htmlFor="client" className="text-lg">
                                        Cliente
                                    </Label>
                                    <div className="flex">
                                        <InputWithAdd
                                            id="client"
                                            placeholder="Cliente"
                                            inputClassName="rounded-r-none"
                                            value={formValues.customer}
                                            onSearch={searchCustomers}
                                            onChange={(value: string) => {
                                                setFormValues((prev) => ({ ...prev, customer: value }));
                                            }}
                                            required
                                        />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size={"icon-lg"}
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
                                </div>

                                <div className="grid lg:col-span-2 xl:col-span-1">
                                    <Label htmlFor="deviceType" className="text-lg">
                                        Tipologia dispositivo
                                    </Label>
                                    <div className="flex">
                                        <InputWithAdd
                                            id="deviceType"
                                            placeholder="Es. iPhone 13"
                                            inputClassName="rounded-r-none"
                                            value={formValues.deviceType}
                                            options={deviceOptions}
                                            onCreate={async (value: string) => {
                                                const createdDevice = await createDevice({ name: value });
                                                setDeviceOptions((prev) => Array.from(new Set([...prev, value])));
                                                setDeviceIdByOption((prev) => ({
                                                    ...prev,
                                                    [createdDevice.name]: createdDevice.id,
                                                }));
                                            }}
                                            onChange={(value: string) =>
                                                setFormValues((prev) => ({ ...prev, deviceType: value }))
                                            }
                                            required
                                        />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size={"icon-lg"}
                                                    className="rounded-l-none border-l-0!"
                                                    onClick={() => setIsCreateDeviceDialogOpen(true)}
                                                    aria-label="Crea nuovo dispositivo"
                                                >
                                                    <Plus className="size-5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Crea nuovo dispositivo</TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                Intervento
                            </h3>

                            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">
                                <div className="grid lg:col-span-2 xl:col-span-1">
                                    <Label htmlFor="issue" className="text-lg">
                                        Difetto
                                    </Label>
                                    <div className="flex">
                                        <InputWithAdd
                                            id="issue"
                                            placeholder="Cerca il difetto"
                                            inputClassName={`rounded-r-none ${fieldErrors.issue ? "border-destructive focus-visible:ring-destructive/40" : ""}`}
                                            value={formValues.issue}
                                            options={issueOptions}
                                            onCreate={async (value: string) => {
                                                const createdIssue = await createIssue({ description: value });
                                                setIssueOptions((prev) => Array.from(new Set([...prev, value])));
                                                setIssueIdByOption((prev) => ({
                                                    ...prev,
                                                    [createdIssue.description]: createdIssue.id,
                                                }));
                                            }}
                                            onChange={(value: string) => {
                                                setFormValues((prev) => ({ ...prev, issue: value }));
                                                if (fieldErrors.issue) {
                                                    setFieldErrors((prev) => ({ ...prev, issue: false }));
                                                }
                                            }}
                                            required
                                        />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size={"icon-lg"}
                                                    className="rounded-l-none border-l-0!"
                                                    onClick={() => setIsCreateIssueDialogOpen(true)}
                                                    aria-label="Crea nuovo difetto"
                                                >
                                                    <Plus className="size-5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Crea nuovo difetto</TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>

                                {/*
                                    Solo con "Altro": è il caso in cui l'etichetta del catalogo non
                                    dice niente al cliente, e quello che si scrive qui è ciò che
                                    compare sulla ricevuta sotto "Problema riscontrato". Con
                                    qualunque altro difetto la casella non serve e non compare.
                                */}
                                {isCatchAllIssue(formValues.issue) ? (
                                    <div className="grid lg:col-span-2 xl:col-span-2">
                                        <Label htmlFor="issueDescription" className="text-lg">
                                            Problema riscontrato
                                        </Label>
                                        <Textarea
                                            id="issueDescription"
                                            className={`text-lg! ${fieldErrors.issueDescription ? "border-destructive focus-visible:ring-destructive/40" : ""}`}
                                            placeholder="Descrivi il problema: è quello che il cliente legge sulla ricevuta"
                                            maxLength={255}
                                            value={formValues.issueDescription}
                                            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    issueDescription: event.target.value,
                                                }));
                                                if (fieldErrors.issueDescription) {
                                                    setFieldErrors((prev) => ({ ...prev, issueDescription: false }));
                                                }
                                            }}
                                        />
                                    </div>
                                ) : null}

                                <div className="grid">
                                    <Label htmlFor="password" className="text-lg">
                                        Password sblocco
                                    </Label>
                                    <Input
                                        className="text-lg!"
                                        id="password"
                                        placeholder="Password dispositivo"
                                        value={formValues.password}
                                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                            setFormValues((prev) => ({ ...prev, password: event.target.value }))
                                        }
                                    />
                                </div>

                                <div className="grid lg:col-span-2 xl:col-span-3">
                                    <Label htmlFor="notes" className="text-lg">
                                        Note
                                    </Label>
                                    <Textarea
                                        className="text-lg!"
                                        id="notes"
                                        placeholder="Note"
                                        rows={4}
                                        value={formValues.notes}
                                        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                                            setFormValues((prev) => ({ ...prev, notes: event.target.value }))
                                        }
                                    />
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-3 rounded-md border border-primary/15 bg-muted/20 p-4">
                            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                Stato
                            </h3>

                            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-2">
                                <div className="grid gap-2 rounded-md">
                                    <Label htmlFor="charger" className="w-full text-lg">
                                        Alimentatore presente
                                    </Label>
                                    <Select
                                        value={formValues.charger}
                                        onValueChange={(value) => {
                                            setFormValues((prev) => ({ ...prev, charger: value }));
                                            if (fieldErrors.charger && value !== "unset") {
                                                setFieldErrors((prev) => ({ ...prev, charger: false }));
                                            }
                                        }}
                                    >
                                        <SelectTrigger
                                            id="charger"
                                            className={`w-full ${fieldErrors.charger ? "border-destructive focus-visible:ring-destructive/40" : ""}`}
                                        >
                                            <SelectValue placeholder="Seleziona" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unset">Seleziona</SelectItem>
                                            <SelectItem value="yes">Si</SelectItem>
                                            <SelectItem value="no">No</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2 rounded-md">
                                    <Label htmlFor="dataBackup" className="w-full text-lg">
                                        Backup dati
                                    </Label>
                                    <Select
                                        value={formValues.dataBackup}
                                        onValueChange={(value) => {
                                            setFormValues((prev) => ({ ...prev, dataBackup: value }));
                                            if (fieldErrors.dataBackup && value !== "unset") {
                                                setFieldErrors((prev) => ({ ...prev, dataBackup: false }));
                                            }
                                        }}
                                    >
                                        <SelectTrigger
                                            id="dataBackup"
                                            className={`w-full ${fieldErrors.dataBackup ? "border-destructive focus-visible:ring-destructive/40" : ""}`}
                                        >
                                            <SelectValue placeholder="Seleziona" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unset">Seleziona</SelectItem>
                                            <SelectItem value="yes">Si</SelectItem>
                                            <SelectItem value="no">No</SelectItem>
                                        </SelectContent>
                                    </Select>
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
                    setCustomerIdByOption((prev) => ({
                        ...prev,
                        [customerOption]: createdCustomer.id,
                    }));
                    setFormValues((prev) => ({ ...prev, customer: customerOption }));
                }}
            />

            <CreateDeviceDialog
                open={isCreateDeviceDialogOpen}
                onOpenChange={setIsCreateDeviceDialogOpen}
                onSubmit={async (values) => {
                    const createdDevice = await createDevice({
                        name: String(values.name).trim(),
                    });

                    setDeviceOptions((prev) => Array.from(new Set([...prev, createdDevice.name])));
                    setDeviceIdByOption((prev) => ({ ...prev, [createdDevice.name]: createdDevice.id }));
                    setFormValues((prev) => ({ ...prev, deviceType: createdDevice.name }));
                }}
            />

            <CreateIssueDialog
                open={isCreateIssueDialogOpen}
                onOpenChange={setIsCreateIssueDialogOpen}
                onSubmit={async (values) => {
                    const createdIssue = await createIssue({
                        description: String(values.description).trim(),
                    });

                    setIssueOptions((prev) => Array.from(new Set([...prev, createdIssue.description])));
                    setIssueIdByOption((prev) => ({ ...prev, [createdIssue.description]: createdIssue.id }));
                    setFormValues((prev) => ({ ...prev, issue: createdIssue.description }));
                }}
            />
        </>
    );
};

export default CreateReportDialog;
