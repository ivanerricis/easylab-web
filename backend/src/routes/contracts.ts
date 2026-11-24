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
    contractStatuses,
    contractStoredStatuses,
    contractTermMonthsRange,
    contractTypes,
    signedContractMaxBytes,
} from "../db/schema";
import { getAppTimeZone, getLabConfig } from "../config/lab";
import { currentMonthKey } from "../db/queries/timeZone";
import { getCustomerById } from "../db/queries/customer";
import {
    findCustomerDeviceIdsOfCustomer,
    listDevicesOfContracts,
    type ContractDevice,
} from "../db/queries/customerDevice";
import { getProviderById } from "../db/queries/provider";
import {
    consumingInterventionTypes,
    getContractHoursSummary,
    resetAssistanceAlerts,
} from "../services/assistanceHours";
import {
    assistancePackageKeys,
    assistancePackages,
    getPackageInfo,
    isContractPeriodPackage,
    packageSnapshot,
    supportTermMonths,
    type AssistancePackage,
} from "../services/assistancePackages";
import {
    formatBillingPeriod,
    formatContractTerm,
    formatHours,
    formatIncludedHours,
    formatMonthLabel,
    formatPackageName,
    formatPackagePrice,
    formatPriority,
} from "../services/contractLabels";
import { buildContractEmail, signedContractAttachmentName } from "../services/contractEmail";
import { formatDeviceLine } from "../services/customerDeviceLabels";
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
const supportTermMessage = "Il pacchetto Supporto dura sempre 12 mesi";
const deviceNotOfCustomerMessage = "Uno o più dispositivi non esistono o non sono del cliente del contratto";

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

// Solo la chiave: ore e prezzo li copia il server dal listino (`services/assistancePackages.ts`).
const assistanceBodySchema = z.object({ package: z.enum(assistancePackageKeys) }).strict();

const monthsSchema = z.coerce.number().int().min(contractTermMonthsRange.min).max(contractTermMonthsRange.max);

const maxContractDevices = 50;

const contractBodyShape = {
    type: z.enum(contractTypes),
    status: z.enum(contractStoredStatuses).optional(),
    termMonths: monthsSchema,
    // Solo per il noleggio (lo impone `superRefine`); stessa scala della durata.
    billingMonths: monthsSchema.optional(),
    // I dispositivi del cliente coperti dal contratto, facoltativi. Nella modifica, se presente,
    // l'elenco sostituisce quello di prima (anche vuoto: li toglie tutti).
    deviceIds: z
        .array(z.coerce.number().int().positive())
        .max(maxContractDevices)
        .refine((ids) => new Set(ids).size === ids.length, { message: "Un dispositivo è indicato più volte" })
        .optional(),
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
 * `assistance`, con nome, periodo, priorità e tipologia presi dal listino per chiave.
 */
export const toContractDto = (
    {
        package: assistancePackage,
        includedHours,
        priceCents,
        signedFileName,
        signedSizeBytes,
        signedUploadedAt,
        ...row
    }: ContractRow,
    devices: ContractDevice[]
) => {
    const info = assistancePackage ? getPackageInfo(assistancePackage) : null;

    return {
        ...row,
        customerName: row.customerName ?? "",
        devices,
        assistance:
            info && includedHours !== null && priceCents !== null
                ? {
                      package: info.key,
                      name: info.name,
                      includedHours,
                      priceCents,
                      period: info.period,
                      priority: info.priority,
                      typology: info.typology,
                  }
                : null,
        // Solo i dati del file: il PDF si scarica da `/:id/signed-contract`.
        signedContract:
            signedFileName !== null && signedSizeBytes !== null && signedUploadedAt !== null
                ? { fileName: signedFileName, sizeBytes: signedSizeBytes, uploadedAt: signedUploadedAt }
                : null,
    };
};

/** Se tutti i dispositivi indicati esistono e sono di quel cliente (l'elenco è già senza doppioni). */
const areDevicesOfCustomer = async (customerId: number, deviceIds: number[]) =>
    deviceIds.length === 0 ||
    (await findCustomerDeviceIdsOfCustomer(customerId, deviceIds)).length === deviceIds.length;

/** Il pacchetto di una riga contratto, se è un'assistenza con tutti i dati (ore e prezzo non nulli). */
const assistanceOf = (contract: ContractRow) =>
    contract.package && contract.includedHours !== null && contract.priceCents !== null
        ? { package: contract.package, includedHours: contract.includedHours, priceCents: contract.priceCents }
        : null;

contractsRouter.get("/", validate({ query: contractListQuerySchema }), async (req, res) => {
    const query = req.query as unknown as z.infer<typeof contractListQuerySchema>;

    const contracts = await listContracts({
        ...query,
        status: query.status ?? "all",
        type: query.type ?? "all",
        timeZone: await getAppTimeZone(),
    });
    // I dispositivi di tutta la pagina in una query sola (una per riga sarebbe un N+1).
    const rows = Array.isArray(contracts) ? contracts : contracts.items;
    const devicesByContract = await listDevicesOfContracts(rows.map((row) => row.id));
    const toDto = (row: ContractRow) => toContractDto(row, devicesByContract.get(row.id) ?? []);

    sendListResponse(
        res,
        Array.isArray(contracts) ? contracts.map(toDto) : { ...contracts, items: contracts.items.map(toDto) },
        query.page,
        query.pageSize
    );
});

// Il listino per il modulo di creazione e modifica. Prima delle rotte `/:id`.
contractsRouter.get("/packages", (_req, res) => {
    res.json(
        assistancePackages.map(({ key, name, includedHours, priceCents, period, priority, typology }) => ({
            key,
            name,
            includedHours,
            priceCents,
            period,
            priority,
            typology,
        }))
    );
});

/**
 * Le righe del riepilogo ore del PDF, dal mese più recente. Mensile: percentuale sulle ore del
 * mese. Supporto: nessuna percentuale mensile, ma il totale cumulato fino a quel mese incluso.
 */
const buildPrintHours = (
    monthlyHours: { month: string; usedHours: number }[],
    pack: { package: AssistancePackage; includedHours: number }
): ContractPrintData["monthlyHours"] => {
    const perContract = isContractPeriodPackage(pack.package);
    const cumulative = new Map<string, number>();
    let running = 0;

    // Dal più vecchio al più recente: il totale di un mese comprende quelli prima.
    for (const entry of [...monthlyHours].sort((a, b) => a.month.localeCompare(b.month))) {
        running = Math.round((running + entry.usedHours) * 100) / 100;
        cumulative.set(entry.month, running);
    }

    return monthlyHours.map((entry) => ({
        monthLabel: formatMonthLabel(entry.month),
        usedHoursLabel: formatHours(entry.usedHours),
        usageLabel: perContract ? null : `${Math.round((entry.usedHours / pack.includedHours) * 100)}%`,
        cumulativeLabel: perContract ? formatHours(cumulative.get(entry.month) ?? 0) : null,
    }));
};

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
    const pack = assistanceOf(contract);
    const [[customer], [provider], hoursSummary, devicesByContract] = await Promise.all([
        getCustomerById(contract.customerId),
        getProviderById(contract.providerId),
        pack
            ? getContractHoursSummary(id, pack.package, pack.includedHours, currentMonthKey(timeZone))
            : Promise.resolve(null),
        listDevicesOfContracts([id]),
    ]);
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
        devices: (devicesByContract.get(id) ?? []).map(formatDeviceLine),
        termLabel: formatContractTerm(contract.termMonths),
        billingLabel: contract.billingMonths ? formatBillingPeriod(contract.billingMonths) : null,
        // Date "solo giorno" (YYYY-MM-DD): niente fuso, quindi `formatDayLabel`. La data di fine è
        // quella della pagina del contratto, senza sottrazioni.
        startDateLabel: formatDayLabel(contract.startDate),
        endDateLabel: formatDayLabel(contract.endDate),
        note: contract.note?.trim() || null,
        assistance: pack
            ? {
                  period: getPackageInfo(pack.package).period,
                  packageName: formatPackageName(pack.package),
                  includedHoursLabel: formatIncludedHours(pack.includedHours, getPackageInfo(pack.package).period),
                  priceLabel: formatPackagePrice(pack.priceCents, getPackageInfo(pack.package).period),
                  priorityLabel: formatPriority(getPackageInfo(pack.package).priority),
                  typology: getPackageInfo(pack.package).typology,
                  coveredInterventionTypes: consumingInterventionTypes(pack.package).map(formatInterventionType),
              }
            : null,
        monthlyHours:
            kind === "contract" && pack && hoursSummary?.monthlyHours.some((entry) => entry.usedHours > 0)
                ? buildPrintHours(hoursSummary.monthlyHours, pack)
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

        const [[customer], signed, devicesByContract] = await Promise.all([
            getCustomerById(contract.customerId),
            getSignedContract(id),
            listDevicesOfContracts([id]),
        ]);
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
            deviceNames: (devicesByContract.get(id) ?? []).map((device) => device.name),
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
    const pack = assistanceOf(contract);
    const hours = pack
        ? await getContractHoursSummary(id, pack.package, pack.includedHours, currentMonthKey(timeZone))
        : { hours: null, monthlyHours: [] };

    const devicesByContract = await listDevicesOfContracts([id]);

    res.json({ ...toContractDto(contract, devicesByContract.get(id) ?? []), ...hours });
});

contractsRouter.post(
    "/",
    auditAs("creato contratto"),
    validate({ body: contractCreateBodySchema }),
    async (req, res) => {
        const { assistance, deviceIds, ...data } = req.body as z.infer<typeof contractCreateBodySchema>;

        // Il Supporto dura sempre 12 mesi: l'unico vincolo fra pacchetto e durata.
        if (assistance && isContractPeriodPackage(assistance.package) && data.termMonths !== supportTermMonths) {
            res.status(400).json({ message: supportTermMessage, field: "termMonths" });
            return;
        }

        if (deviceIds && !(await areDevicesOfCustomer(data.customerId, deviceIds))) {
            res.status(400).json({ message: deviceNotOfCustomerMessage, field: "deviceIds" });
            return;
        }

        // Contratto e riga di assistenza nella stessa transazione: la totalità della
        // specializzazione non è espressa in SQL, la garantisce questa chiamata.
        const created = await createContract(
            data,
            // Ore e prezzo non arrivano dal client: le copia il server dal listino (snapshot).
            assistance ? { package: assistance.package, ...packageSnapshot(assistance.package) } : undefined,
            deviceIds
        );
        const [contract] = await getContractById(created.id, await getAppTimeZone());
        const devicesByContract = await listDevicesOfContracts([contract.id]);

        setAuditSubject(res, describeSubject(contract.id));
        res.status(201).json(toContractDto(contract, devicesByContract.get(contract.id) ?? []));
    }
);

contractsRouter.put(
    "/:id",
    auditAs("modificato contratto"),
    validate({ params: idParamsSchema, body: contractUpdateBodySchema }),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const { assistance, deviceIds, ...data } = req.body as z.infer<typeof contractUpdateBodySchema>;
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

        // I dispositivi sono del cliente: cambiandolo quelli di prima non valgono più. Si accetta solo
        // se la richiesta indica anche l'elenco per il nuovo cliente (anche vuoto).
        const customerChanged = data.customerId !== undefined && data.customerId !== current.customerId;
        const resultingCustomerId = data.customerId ?? current.customerId;

        if (customerChanged && deviceIds === undefined && (await listDevicesOfContracts([id])).has(id)) {
            res.status(400).json({
                message: "Il cliente non si può cambiare senza indicare i dispositivi del nuovo cliente",
                field: "customerId",
            });
            return;
        }

        if (deviceIds && !(await areDevicesOfCustomer(resultingCustomerId, deviceIds))) {
            res.status(400).json({ message: deviceNotOfCustomerMessage, field: "deviceIds" });
            return;
        }

        if (assistance && current.type !== "assistance") {
            res.status(400).json({ message: "Solo un contratto di assistenza ha dati di assistenza" });
            return;
        }

        // Il Supporto dura sempre 12 mesi, sulla riga risultante: vale anche cambiando solo la durata
        // di un contratto Supporto, o passando a Supporto con una durata attuale diversa.
        const resultingPackage = (assistance?.package ?? current.package) as AssistancePackage | null;
        const resultingTerm = data.termMonths ?? current.termMonths;

        if (resultingPackage && isContractPeriodPackage(resultingPackage) && resultingTerm !== supportTermMonths) {
            res.status(400).json({ message: supportTermMessage, field: "termMonths" });
            return;
        }

        // Cambiando pacchetto, ore e prezzo si copiano di nuovo dal listino (il client non li manda).
        // Lo stesso pacchetto ripetuto non cambia niente: non si riscrive lo snapshot di un firmato.
        const newPackage = assistance?.package;
        const packageChanged = newPackage !== undefined && newPackage !== current.package;
        const assistanceChanges = packageChanged ? { package: newPackage, ...packageSnapshot(newPackage) } : undefined;

        // `type` è già uguale a quello attuale (controllo qui sopra): non si riscrive.
        const { type: _type, ...changes } = data;

        await updateContractById(id, changes, assistanceChanges, deviceIds);
        const [updated] = await getContractById(id, timeZone);
        const devicesByContract = await listDevicesOfContracts([id]);

        // Con un altro pacchetto le soglie sono altre: via tutti gli avvisi, poi si ricontrolla. Anche
        // lo spostamento della data di inizio di un Supporto cambia la chiave fissa dei suoi avvisi.
        const supportStartMoved =
            resultingPackage !== null &&
            isContractPeriodPackage(resultingPackage) &&
            data.startDate !== undefined &&
            data.startDate !== current.startDate;

        if (packageChanged || supportStartMoved) {
            await resetAssistanceAlerts(id, currentMonthKey(timeZone));
        }

        setAuditSubject(res, describeSubject(updated.id));
        res.json(toContractDto(updated, devicesByContract.get(id) ?? []));
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
