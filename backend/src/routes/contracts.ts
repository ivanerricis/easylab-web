import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { auditAs, describeSubject, setAuditSubject } from "../middleware/auditContext";
import {
    createContract,
    deleteContractById,
    deleteSignedContract,
    getContractById,
    getSignedContract,
    hasLinkedInterventions,
    listContracts,
    saveSignedContract,
    updateContractById,
    type ContractRow,
} from "../db/queries/contract";
import {
    assistancePackageHours,
    assistanceTypes,
    contractStatuses,
    contractStoredStatuses,
    contractTermMonthsRange,
    contractTypes,
    signedContractMaxBytes,
    type AssistanceType,
} from "../db/schema";
import { getAppTimeZone, getLabConfig } from "../config/lab";
import { currentMonthKey } from "../db/queries/timeZone";
import { getCustomerById } from "../db/queries/customer";
import { getProviderById } from "../db/queries/provider";
import {
    consumingInterventionTypes,
    getContractHoursSummary,
    recheckAssistanceHours,
} from "../services/assistanceHours";
import {
    formatAssistanceType,
    formatBillingPeriod,
    formatContractTerm,
    formatHours,
    formatMonthLabel,
} from "../services/contractLabels";
import { buildContractEmail, signedContractAttachmentName } from "../services/contractEmail";
import { createContractPdfBuffer, type ContractPrintData } from "../services/contractPdf";
import { sendEmail } from "../services/emailManager";
import { consumeEmailSendSlot } from "../services/emailSendRateLimit";
import { loadPrintableLogo } from "../services/logoManager";
import {
    readSignedContractFile,
    removeSignedContractFile,
    stageSignedContractFile,
} from "../services/signedContractFiles";
import { formatInterventionType } from "../services/interventionLabels";
import { formatDateLabel, formatDayLabel, formatPhoneLabel } from "./formatting";
import { idParamsSchema, listQuerySchema, sendListResponse } from "./crudRouter";
import { validate } from "./validation";

const contractsRouter = Router();

const contractNotFoundMessage = "Contratto non trovato";
const signedContractNotFoundMessage = "Il contratto firmato non è ancora stato caricato";
const logoContentId = "logo-laboratorio";

// In memoria, come il logo: dopo il controllo dei byte il file va in `data/signed-contracts/`.
const signedContractUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: signedContractMaxBytes, files: 1 },
});

/**
 * Un PDF si riconosce dai byte, non dal tipo dichiarato nell'upload (lo scrive chi carica). La
 * specifica tollera qualche byte prima della firma `%PDF-`, quindi la si cerca nel primo KB.
 */
const isPdf = (content: Buffer) => content.subarray(0, 1024).includes("%PDF-");

/**
 * Il nome con cui mostrare il file: senza percorso e senza caratteri di controllo. Multer legge
 * il nome come latin1, quindi si riconverte in UTF-8 per non rovinare le lettere accentate.
 */
export const cleanUploadedFileName = (originalName: string) => {
    const decoded = Buffer.from(originalName, "latin1").toString("utf8");
    const baseName = (decoded.includes("�") ? originalName : decoded).split(/[\\/]/).pop() ?? "";
    // eslint-disable-next-line no-control-regex
    const cleaned = baseName.replace(/[\u0000-\u001f\u007f]/g, "").trim();

    return (cleaned || "contratto-firmato.pdf").slice(0, 255);
};
const invalidPackageMessage = "Pacchetto di ore non valido per questo tipo di assistenza";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Il formato non basta: "2026-02-31" lo passa e Postgres lo rifiuta con un errore non
// gestito (500). Si riconverte la data e si controlla che sia la stessa.
const isRealDay = (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

const contractSortFields = ["startDate", "endDate", "createdAt", "customer"] as const;

const contractListQuerySchema = listQuerySchema.extend({
    sortBy: z.enum(contractSortFields).optional(),
    type: z.enum(["all", ...contractTypes]).optional(),
    // Lo stato effettivo: `expired` c'è solo qui, non nel corpo di una scrittura.
    status: z.enum(["all", ...contractStatuses]).optional(),
    customerId: z.coerce.number().int().positive().optional(),
    providerId: z.coerce.number().int().positive().optional(),
});

/**
 * Ore incluse valide per il tipo di assistenza: la tabella `assistancePackageHours` di
 * `schema.ts`, la stessa che il CHECK `assistance_package_check` fa rispettare al database.
 * Qui serve a rispondere con un 400 chiaro invece di aspettare l'errore del vincolo.
 */
const isValidPackage = (assistanceType: AssistanceType, includedHours: number | null) => {
    const allowed = assistancePackageHours[assistanceType];

    return allowed === null ? includedHours === null : includedHours !== null && allowed.includes(includedHours);
};

const assistanceBodySchema = z
    .object({
        assistanceType: z.enum(assistanceTypes),
        // NULL per il tempo pieno (ore illimitate), un numero di ore per gli altri.
        includedHours: z.number().int().positive().nullable().optional(),
    })
    .strict();

const monthsSchema = z.coerce.number().int().min(contractTermMonthsRange.min).max(contractTermMonthsRange.max);

const contractBodyShape = {
    type: z.enum(contractTypes),
    status: z.enum(contractStoredStatuses).optional(),
    termMonths: monthsSchema,
    // Solo per il noleggio (lo impone `superRefine`); stessa scala della durata.
    billingMonths: monthsSchema.optional(),
    device: z.string().trim().min(1).max(255),
    note: z.string().trim().max(4000).nullable().optional(),
    startDate: z.string().regex(dateRegex).refine(isRealDay, { message: "La data di inizio non è valida" }),
    customerId: z.coerce.number().int().positive(),
    providerId: z.coerce.number().int().positive(),
};

// Dati di assistenza obbligatori se e solo se il contratto è di assistenza: la disgiunzione
// delle due specializzazioni, vista dal corpo della richiesta.
const contractCreateBodySchema = z
    .object({ ...contractBodyShape, assistance: assistanceBodySchema.optional() })
    .strict()
    .superRefine((value, context) => {
        if (value.type === "assistance" && !value.assistance) {
            context.addIssue({
                code: "custom",
                path: ["assistance"],
                message: "I dati di assistenza sono obbligatori per un contratto di assistenza",
            });
        }

        if (value.type === "rental" && value.billingMonths === undefined) {
            context.addIssue({
                code: "custom",
                path: ["billingMonths"],
                message: "Il periodo di fatturazione è obbligatorio per un noleggio",
            });
        }

        if (value.type === "assistance" && value.billingMonths !== undefined) {
            context.addIssue({
                code: "custom",
                path: ["billingMonths"],
                message: "Solo un noleggio ha un periodo di fatturazione",
            });
        }

        if (value.type !== "assistance" && value.assistance) {
            context.addIssue({
                code: "custom",
                path: ["assistance"],
                message: "Solo un contratto di assistenza ha dati di assistenza",
            });
        }
    });

const contractUpdateBodySchema = z
    .object({
        ...contractBodyShape,
        assistance: assistanceBodySchema.partial().optional(),
    })
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: "È necessario specificare almeno un campo",
    });

/**
 * Il JSON della API per un contratto. Parte dalla riga piatta delle query e la ripiega in
 * `assistance`; un punto solo da estendere quando si aggiungeranno i campi derivati (le ore).
 */
export const toContractDto = ({
    assistanceType,
    includedHours,
    signedFileName,
    signedSizeBytes,
    signedUploadedAt,
    ...row
}: ContractRow) => ({
    ...row,
    customerName: row.customerName ?? "",
    assistance: assistanceType ? { assistanceType, includedHours } : null,
    // Solo i dati del file: il PDF si scarica da `/:id/signed-contract`.
    signedContract:
        signedFileName !== null && signedSizeBytes !== null && signedUploadedAt !== null
            ? { fileName: signedFileName, sizeBytes: signedSizeBytes, uploadedAt: signedUploadedAt }
            : null,
});

contractsRouter.get("/", validate({ query: contractListQuerySchema }), async (req, res) => {
    const query = req.query as unknown as z.infer<typeof contractListQuerySchema>;

    const contracts = await listContracts({
        ...query,
        status: query.status ?? "all",
        type: query.type ?? "all",
        timeZone: await getAppTimeZone(),
    });

    sendListResponse(
        res,
        Array.isArray(contracts)
            ? contracts.map(toContractDto)
            : { ...contracts, items: contracts.items.map(toContractDto) },
        query.page,
        query.pageSize
    );
});

/**
 * I dati del PDF di un contratto. Una bozza è un preventivo, ogni altro stato un contratto.
 * Il riepilogo ore c'è solo per un contratto di assistenza che abbia davvero ore registrate:
 * un preventivo non ne ha, e una tabella di soli zeri sarebbe rumore.
 */
const loadContractPrintData = async (id: number): Promise<ContractPrintData | null> => {
    const timeZone = await getAppTimeZone();
    const [contract] = await getContractById(id, timeZone);

    if (!contract) {
        return null;
    }

    const kind = contract.effectiveStatus === "draft" ? "quote" : "contract";
    const [[customer], [provider], hoursSummary] = await Promise.all([
        getCustomerById(contract.customerId),
        getProviderById(contract.providerId),
        contract.assistanceType
            ? getContractHoursSummary(id, contract.includedHours, currentMonthKey(timeZone))
            : Promise.resolve(null),
    ]);
    const { assistanceType, includedHours } = contract;
    const providerContact = [provider.firstName, provider.lastName].filter(Boolean).join(" ");

    return {
        id: contract.id,
        kind,
        status: contract.effectiveStatus,
        issuedAtLabel: formatDateLabel(new Date(), timeZone),
        customerName: contract.customerName ?? "",
        customerPhone: customer.phoneNumber
            ? formatPhoneLabel(customer.phoneNumber, customer.phoneNumberSecondary)
            : null,
        customerEmail: customer.email?.trim() || null,
        customerCity: customer.city?.trim() || null,
        providerName: provider.providerName,
        providerLogoDataUrl: provider.logoDataUrl,
        providerContact: providerContact || null,
        providerEmail: provider.email,
        providerPhone: formatPhoneLabel(provider.phoneNumber),
        type: contract.type,
        device: contract.device,
        termLabel: formatContractTerm(contract.termMonths),
        billingLabel: contract.billingMonths ? formatBillingPeriod(contract.billingMonths) : null,
        // Date "solo giorno" (YYYY-MM-DD): niente fuso, quindi `formatDayLabel`. La data di fine è
        // quella della pagina del contratto, senza sottrazioni.
        startDateLabel: formatDayLabel(contract.startDate),
        endDateLabel: formatDayLabel(contract.endDate),
        note: contract.note?.trim() || null,
        assistance: assistanceType
            ? {
                  assistanceTypeLabel: formatAssistanceType(assistanceType),
                  includedHoursLabel:
                      includedHours === null ? "Ore illimitate" : `${formatHours(includedHours)} al mese`,
                  coveredInterventionTypes: consumingInterventionTypes(assistanceType).map(formatInterventionType),
              }
            : null,
        monthlyHours:
            kind === "contract" && hoursSummary?.monthlyHours.some((entry) => entry.usedHours > 0)
                ? hoursSummary.monthlyHours.map((entry) => ({
                      monthLabel: formatMonthLabel(entry.month),
                      usedHoursLabel: formatHours(entry.usedHours),
                      usageLabel:
                          includedHours === null ? "-" : `${Math.round((entry.usedHours / includedHours) * 100)}%`,
                  }))
                : [],
    };
};

contractsRouter.get("/:id/print", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const data = await loadContractPrintData(id);

    if (!data) {
        res.status(404).json({ message: contractNotFoundMessage });
        return;
    }

    const pdfBuffer = await createContractPdfBuffer(data);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `inline; filename=${data.kind === "quote" ? "preventivo" : "contratto"}-${id}.pdf`
    );
    res.send(pdfBuffer);
});

contractsRouter.get("/:id/signed-contract", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const content = (await getSignedContract(id)) ? await readSignedContractFile(id) : null;

    if (!content) {
        res.status(404).json({ message: signedContractNotFoundMessage });
        return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=contratto-firmato-${id}.pdf`);
    res.send(content);
});

contractsRouter.post(
    "/:id/signed-contract",
    auditAs("caricato contratto firmato"),
    validate({ params: idParamsSchema }),
    signedContractUpload.single("file"),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };

        if (!req.file) {
            res.status(400).json({ message: "Nessun file caricato" });
            return;
        }

        if (!isPdf(req.file.buffer)) {
            res.status(400).json({ message: "Il contratto firmato deve essere un file PDF" });
            return;
        }

        const [contract] = await getContractById(id, await getAppTimeZone());

        if (!contract) {
            res.status(404).json({ message: contractNotFoundMessage });
            return;
        }

        // Prima il file accanto a quello definitivo, poi la riga: se la riga non si salva il file
        // nuovo si butta e resta quello di prima; se si salva, il file prende il suo posto.
        const staged = await stageSignedContractFile(id, req.file.buffer);
        let saved: Awaited<ReturnType<typeof saveSignedContract>>;

        try {
            saved = await saveSignedContract(id, cleanUploadedFileName(req.file.originalname), req.file.size);
        } catch (error) {
            await staged.discard();
            throw error;
        }

        await staged.commit();

        setAuditSubject(res, describeSubject(id, contract.customerName));
        res.status(201).json(saved);
    }
);

contractsRouter.delete(
    "/:id/signed-contract",
    auditAs("eliminato contratto firmato"),
    validate({ params: idParamsSchema }),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const deleted = await deleteSignedContract(id);

        if (deleted.length === 0) {
            res.status(404).json({ message: signedContractNotFoundMessage });
            return;
        }

        await removeSignedContractFile(id);
        setAuditSubject(res, describeSubject(id));
        res.json({ message: "Contratto firmato eliminato" });
    }
);

/** Manda al cliente il contratto firmato caricato: senza firmato non si invia niente. */
contractsRouter.post(
    "/:id/send-email",
    auditAs("inviato contratto firmato al cliente"),
    validate({ params: idParamsSchema }),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };

        // Lo stesso contatore delle email degli interventi: vedi services/emailSendRateLimit.ts.
        if (!consumeEmailSendSlot(String(req.user?.id ?? "senza-utente"))) {
            res.status(429).json({ message: "Troppe email inviate nell'ultima ora. Riprova più tardi." });
            return;
        }

        const [contract] = await getContractById(id, await getAppTimeZone());

        if (!contract) {
            res.status(404).json({ message: contractNotFoundMessage });
            return;
        }

        const [[customer], signed] = await Promise.all([getCustomerById(contract.customerId), getSignedContract(id)]);
        const customerEmail = customer?.email?.trim();
        const content = signed ? await readSignedContractFile(id) : null;

        if (!content) {
            res.status(400).json({ message: "Carica il contratto firmato prima di inviarlo al cliente" });
            return;
        }

        if (!customerEmail) {
            res.status(400).json({ message: "Il cliente non ha un indirizzo email configurato" });
            return;
        }

        const [{ labName, labEmail, labAddress, labPhone }, logo] = await Promise.all([
            getLabConfig(),
            loadPrintableLogo(),
        ]);
        const email = buildContractEmail({
            customerName: contract.customerName ?? "",
            labName,
            labEmail,
            labAddress,
            labPhone,
            type: contract.type,
            device: contract.device,
            startDate: contract.startDate,
            logoCid: logo ? logoContentId : null,
        });

        await sendEmail({
            to: customerEmail,
            // La risposta del cliente deve arrivare al laboratorio, come per gli interventi.
            replyTo: labEmail.trim() || undefined,
            subject: email.subject,
            text: email.text,
            html: email.html,
            attachments: [
                {
                    filename: signedContractAttachmentName(contract.startDate),
                    content,
                    contentType: "application/pdf",
                },
                ...(logo
                    ? [{ filename: "logo", content: logo.content, contentType: logo.contentType, cid: logoContentId }]
                    : []),
            ],
        });

        setAuditSubject(res, describeSubject(id, contract.customerName));
        res.json({ message: `Contratto firmato inviato a ${customerEmail}` });
    }
);

contractsRouter.get("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const timeZone = await getAppTimeZone();
    const [contract] = await getContractById(id, timeZone);

    if (!contract) {
        res.status(404).json({ message: contractNotFoundMessage });
        return;
    }

    // Le ore servono solo al dettaglio (la lista non le calcola: sarebbe una query per riga) e
    // solo per l'assistenza; il noleggio ha `hours: null` e nessuno storico.
    const hours = contract.assistanceType
        ? await getContractHoursSummary(id, contract.includedHours, currentMonthKey(timeZone))
        : { hours: null, monthlyHours: [] };

    res.json({ ...toContractDto(contract), ...hours });
});

contractsRouter.post(
    "/",
    auditAs("creato contratto"),
    validate({ body: contractCreateBodySchema }),
    async (req, res) => {
        const { assistance, ...data } = req.body as z.infer<typeof contractCreateBodySchema>;
        const includedHours = assistance?.includedHours ?? null;

        if (assistance && !isValidPackage(assistance.assistanceType, includedHours)) {
            res.status(400).json({ message: invalidPackageMessage });
            return;
        }

        // Contratto e riga di assistenza nella stessa transazione: la totalità della
        // specializzazione non è espressa in SQL, la garantisce questa chiamata.
        const created = await createContract(
            data,
            assistance ? { assistanceType: assistance.assistanceType, includedHours } : undefined
        );
        const [contract] = await getContractById(created.id, await getAppTimeZone());

        setAuditSubject(res, describeSubject(contract.id));
        res.status(201).json(toContractDto(contract));
    }
);

contractsRouter.put(
    "/:id",
    auditAs("modificato contratto"),
    validate({ params: idParamsSchema, body: contractUpdateBodySchema }),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const { assistance, ...data } = req.body as z.infer<typeof contractUpdateBodySchema>;
        const timeZone = await getAppTimeZone();
        const [current] = await getContractById(id, timeZone);

        if (!current) {
            res.status(404).json({ message: contractNotFoundMessage });
            return;
        }

        if (data.type !== undefined && data.type !== current.type) {
            res.status(400).json({ message: "Il tipo di contratto non si può cambiare" });
            return;
        }

        if (data.billingMonths !== undefined && current.type !== "rental") {
            res.status(400).json({ message: "Solo un noleggio ha un periodo di fatturazione" });
            return;
        }

        // I suoi interventi sono dello stesso cliente (chiave composta sull'intervento): cambiarlo li
        // lascerebbe di un altro. Il database rifiuta comunque, ma con un messaggio sull'eliminazione.
        if (
            data.customerId !== undefined &&
            data.customerId !== current.customerId &&
            (await hasLinkedInterventions(id))
        ) {
            res.status(400).json({
                message: "Il cliente non si può cambiare: il contratto ha interventi collegati",
                field: "customerId",
            });
            return;
        }

        if (assistance && current.type !== "assistance") {
            res.status(400).json({ message: "Solo un contratto di assistenza ha dati di assistenza" });
            return;
        }

        // La riga risultante, come per gli interventi: il corpo è parziale, quindi il pacchetto
        // si valida sull'unione con i dati attuali. Cambiando solo il tipo in `full_time` le
        // ore diventano illimitate senza doverle azzerare a mano.
        let assistanceChanges: { assistanceType?: AssistanceType; includedHours?: number | null } | undefined;

        if (assistance && Object.keys(assistance).length > 0) {
            const assistanceType = assistance.assistanceType ?? (current.assistanceType as AssistanceType);
            const includedHours =
                assistance.includedHours !== undefined
                    ? assistance.includedHours
                    : assistance.assistanceType === "full_time"
                      ? null
                      : current.includedHours;

            if (!isValidPackage(assistanceType, includedHours)) {
                res.status(400).json({ message: invalidPackageMessage });
                return;
            }

            assistanceChanges = { assistanceType, includedHours };
        }

        // `type` è già uguale a quello attuale (controllo qui sopra): non si riscrive.
        const { type: _type, ...changes } = data;

        await updateContractById(id, changes, assistanceChanges);
        const [updated] = await getContractById(id, timeZone);

        // Il pacchetto può essere cambiato: più ore possono far rientrare il mese corrente sotto una
        // soglia (e riarmare l'avviso), meno ore possono farne scattare una.
        if (assistanceChanges) {
            await recheckAssistanceHours([{ contractId: id, month: currentMonthKey(timeZone) }]);
        }

        setAuditSubject(res, describeSubject(updated.id));
        res.json(toContractDto(updated));
    }
);

contractsRouter.delete(
    "/:id",
    auditAs("eliminato contratto"),
    validate({ params: idParamsSchema }),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const deleted = await deleteContractById(id);

        if (deleted.length === 0) {
            res.status(404).json({ message: contractNotFoundMessage });
            return;
        }

        // La riga del firmato se ne va in cascata con il contratto; il PDF su disco lo togliamo qui.
        await removeSignedContractFile(id);

        setAuditSubject(res, describeSubject(deleted[0].id));
        res.json(deleted[0]);
    }
);

export default contractsRouter;
