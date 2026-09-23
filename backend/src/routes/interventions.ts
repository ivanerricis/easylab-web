import { Router } from "express";
import { z } from "zod";
import {
    createIntervention,
    deleteInterventionById,
    getInterventionById,
    getInterventionDetailById,
    getInterventionStats,
    listInterventions,
    updateInterventionById,
} from "../db/queries/intervention";
import { sendEmail } from "../services/emailManager";
import { consumeEmailSendSlot } from "../services/emailSendRateLimit";
import { buildInterventionEmail } from "../services/interventionEmail";
import { createInterventionPdfBuffer } from "../services/interventionPdf";
import { formatInterventionStatus, formatInterventionType } from "../services/interventionLabels";
import { loadPrintableLogo } from "../services/logoManager";
import { getAppTimeZone, getLabConfig } from "../config/lab";
import { formatDayLabel, formatPhoneLabel } from "./formatting";
import { idParamsSchema, listQuerySchema, sendListResponse } from "./crudRouter";
import { validate } from "./validation";
import { toCsv } from "../services/csv";
import { exportRowLimit } from "../db/queries/pagination";
import { interventionStatuses, interventionTypes, type InterventionStatus, type InterventionType } from "../db/schema";

const interventionsRouter = Router();

// Riferimento che lega l'allegato inline all'`<img src="cid:...">` del corpo HTML.
const logoContentId = "logo-laboratorio";

// Le due liste (valori ammessi di `type` e `status`) vivono una sola volta in `db/schema.ts`,
// insieme al tipo della colonna: prima erano riscritte identiche qui, in
// `services/interventionLabels.ts`, `db/queries/intervention.ts` e `routes/summaryPrint.ts`.
const onSiteInterventionTypes = new Set<InterventionType>(["intervento_sede", "intervento_remoto"]);

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;

const interventionSortFields = ["createdAt", "interventionDate", "customer", "status"] as const;

// Come in `reports.ts`: i campi comuni a ogni lista arrivano da `listQuerySchema`, qui si
// aggiungono solo i filtri specifici degli interventi.
const interventionListQuerySchema = listQuerySchema.extend({
    status: z.enum(["all", ...interventionStatuses]).optional(),
    type: z.enum(["all", ...interventionTypes]).optional(),
    dateFrom: z.string().regex(dateRegex).optional(),
    dateTo: z.string().regex(dateRegex).optional(),
    scheduledDate: z.string().regex(dateRegex).optional(),
    // Intervallo sulla data dell'intervento, che è cosa diversa da `dateFrom`/`dateTo`:
    // quelli filtrano la data di creazione. Li usa il calendario per caricare solo il
    // periodo che sta mostrando invece dell'intera tabella.
    scheduledFrom: z.string().regex(dateRegex).optional(),
    scheduledTo: z.string().regex(dateRegex).optional(),
    // Filtro per collaboratore: è la persona che esegue l'intervento, e la sua scheda
    // elenca quelli assegnati a lui. Vedi la stessa voce sulla rotta dei report.
    collaboratorId: z.coerce.number().int().positive().optional(),
    // E per cliente, per la sua pagina degli interventi: stesso problema dei report.
    customerId: z.coerce.number().int().positive().optional(),
    sortBy: z.enum(interventionSortFields).optional(),
});

const interventionBodySchema = z
    .object({
        type: z.enum(interventionTypes),
        // Facoltativa nello schema perché un intervento solo programmato non l'ha ancora;
        // l'obbligo negli altri due stati è applicato più sotto, dove si conosce lo stato.
        description: z.string().trim().max(4000).nullable().optional(),
        // Solo per gli interventi in sede o da remoto: le consegne materiale lo ignorano.
        problem: z.string().trim().max(4000).nullable().optional(),
        // Annotazioni libere: facoltative sempre, per qualunque tipo e stato.
        note: z.string().trim().max(4000).nullable().optional(),
        // Facoltativo: alcuni interventi (es. consegne materiale) non hanno un prezzo da segnare.
        price: z.coerce.number().int().min(0).nullable().optional(),
        // A differenza dei report: solo pagato/non pagato, senza distinguere il mezzo.
        paid: z.boolean().optional(),
        // Indipendente dal pagamento: dice se va emessa fattura, non se è stato incassato.
        toInvoice: z.boolean().optional(),
        status: z.enum(interventionStatuses).optional(),
        customerId: z.coerce.number().int().positive(),
        collaboratorId: z.coerce.number().int().positive(),
        interventionDate: z.string().regex(dateRegex).nullable().optional(),
        startTime: z.string().regex(timeRegex).nullable().optional(),
        endTime: z.string().regex(timeRegex).nullable().optional(),
    })
    .strict();

/**
 * Orari e assistenza effettuata sono i dati del lavoro svolto: nascono mentre lo si fa e si
 * completano alla fine, quindi sono obbligatori solo a intervento "completato" — né da
 * "programmato" né da "in lavorazione". A "completato" restano obbligatori, altrimenti un
 * intervento potrebbe risultare chiuso senza che risulti cosa è stato fatto e quando.
 *
 * Il problema riscontrato non segue questa regola: si conosce già al momento della chiamata
 * del cliente, ed è il motivo per cui l'intervento viene programmato.
 */
const isCompletedStatus = (status?: InterventionStatus) => status === "completato";

/** La riga su cui `validateInterventionRow` applica le regole: vedi lì. */
type InterventionValidationRow = {
    type: InterventionType;
    status?: InterventionStatus;
    interventionDate?: string | null;
    description?: string | null;
    problem?: string | null;
    startTime?: string | null;
    endTime?: string | null;
};

type InterventionValidationFailure = {
    field: "interventionDate" | "description" | "problem" | "startTime" | "endTime";
    message: string;
};

/**
 * Le regole di dominio dell'intervento, applicate alla riga *risultante*: per la POST è il corpo
 * appena arrivato (che per una creazione è già la riga intera); per la PUT è l'unione del corpo
 * parziale con la riga esistente, calcolata dalla rotta prima di chiamare questa funzione.
 *
 * Prima erano scritte due volte — uno `.superRefine()` sullo schema di creazione, una sequenza
 * di `if` a mano sulla PUT — con la combinazione data/orari-mancanti che diceva due cose diverse
 * nei due posti. Un'unica funzione, chiamata identica dalle due rotte, rende impossibile che
 * tornino a dirsi cose diverse. Si ferma alla prima regola violata (come faceva già la PUT):
 * chi chiama la richiama dopo aver corretto, come per qualunque altro controllo del server.
 */
const validateInterventionRow = (row: InterventionValidationRow): InterventionValidationFailure | null => {
    if (!row.interventionDate) {
        return { field: "interventionDate", message: "La data dell'intervento è obbligatoria" };
    }

    const completed = isCompletedStatus(row.status);

    if (completed && !row.description) {
        return {
            field: "description",
            message: "La descrizione del lavoro svolto è obbligatoria quando l'intervento è completato",
        };
    }

    // Il problema riscontrato non segue la stessa regola di orari e lavoro svolto qui sopra: si
    // conosce già al momento della chiamata del cliente, ed è il motivo per cui l'intervento
    // viene programmato. Vale solo per gli interventi in sede o da remoto: le consegne
    // materiale non hanno né problema né orari.
    if (!onSiteInterventionTypes.has(row.type)) {
        return null;
    }

    if (!row.problem) {
        return { field: "problem", message: "Il problema riscontrato è obbligatorio" };
    }

    if (completed && !row.startTime) {
        return { field: "startTime", message: "L'ora di inizio è obbligatoria" };
    }

    if (completed && !row.endTime) {
        return { field: "endTime", message: "L'ora di fine è obbligatoria" };
    }

    // Vale anche quando non sono obbligatori: se gli orari ci sono, devono avere senso.
    if (row.startTime && row.endTime && row.startTime >= row.endTime) {
        return { field: "endTime", message: "L'ora di fine deve essere successiva all'ora di inizio" };
    }

    return null;
};

const interventionUpdateBodySchema = interventionBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "È necessario specificare almeno un campo",
});

interventionsRouter.get("/", validate({ query: interventionListQuerySchema }), async (req, res) => {
    // Il tipo viene dallo schema, come in `reports.ts`: l'export qui sotto, con la sua copia
    // scritta a mano, accettava `scheduledDate` ma non lo passava alla query.
    const query = req.query as unknown as z.infer<typeof interventionListQuerySchema>;

    const interventions = await listInterventions({
        ...query,
        status: query.status ?? "all",
        type: query.type ?? "all",
        timeZone: await getAppTimeZone(),
    });

    sendListResponse(res, interventions, query.page, query.pageSize);
});

// Come in `reports.ts`: gli stessi filtri della lista meno pagina e dimensione pagina, perché
// l'export scarichi tutto ciò che li passa e non una schermata sola.
const interventionExportQuerySchema = interventionListQuerySchema.omit({ page: true, pageSize: true });

// Prima di "/:id": un percorso a un solo segmento come "/export.csv" finirebbe altrimenti
// nella rotta del dettaglio, che lo rifiuterebbe come id non numerico.
interventionsRouter.get("/export.csv", validate({ query: interventionExportQuerySchema }), async (req, res) => {
    const query = req.query as unknown as z.infer<typeof interventionExportQuerySchema>;

    const interventions = await listInterventions({
        ...query,
        status: query.status ?? "all",
        type: query.type ?? "all",
        timeZone: await getAppTimeZone(),
        unpaginatedLimit: exportRowLimit,
    });
    const rows = Array.isArray(interventions) ? interventions : interventions.items;

    const csv = toCsv(rows, [
        { header: "ID", value: (intervention) => intervention.id },
        { header: "Cliente", value: (intervention) => intervention.customer },
        { header: "Telefono cliente", value: (intervention) => intervention.customerPhone },
        { header: "Collaboratore", value: (intervention) => intervention.collaborator },
        { header: "Tipo", value: (intervention) => formatInterventionType(intervention.type) },
        {
            header: "Stato",
            value: (intervention) => formatInterventionStatus(intervention.status),
        },
        { header: "Data intervento", value: (intervention) => intervention.interventionDate },
        { header: "Ora inizio", value: (intervention) => intervention.startTime },
        { header: "Ora fine", value: (intervention) => intervention.endTime },
        { header: "Problema", value: (intervention) => intervention.problem },
        { header: "Descrizione", value: (intervention) => intervention.description },
        { header: "Note", value: (intervention) => intervention.note },
        { header: "Prezzo", value: (intervention) => intervention.price },
        { header: "Pagato", value: (intervention) => intervention.paid },
        { header: "Da fatturare", value: (intervention) => intervention.toInvoice },
        { header: "Creato il", value: (intervention) => intervention.createdAt },
    ]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=interventi.csv");
    res.send(csv);
});

interventionsRouter.get("/stats", async (_req, res) => {
    const stats = await getInterventionStats();

    res.json(stats);
});

const loadInterventionPrintContext = async (id: number) => {
    const [intervention] = await getInterventionDetailById(id);

    if (!intervention) {
        return null;
    }

    const customerName = intervention.customerName ?? "";
    const collaboratorName = intervention.collaboratorName ?? "";
    const { labName, labEmail, labAddress, labPhone } = await getLabConfig();
    const customerPhoneLabel = formatPhoneLabel(intervention.customerPhoneNumber, intervention.customerPhoneSecondary);

    return {
        customerName,
        customerEmail: intervention.customerEmail?.trim() || null,
        labName,
        labEmail,
        labAddress,
        labPhone,
        type: intervention.type,
        // Il giorno dell'email, come YYYY-MM-DD: sempre quello dell'intervento, obbligatorio
        // dalla migration 0037_intervention_date_not_null. Uno solo per testo e nome
        // dell'allegato, così non possono dire due giorni diversi.
        emailDay: intervention.interventionDate,
        pdfData: {
            id: intervention.id,
            labName,
            labEmail,
            labAddress,
            labPhone,
            customerName,
            customerPhone: customerPhoneLabel,
            customerEmail: intervention.customerEmail?.trim() || "-",
            collaboratorName,
            type: intervention.type,
            status: intervention.status,
            description: intervention.description,
            problem: intervention.problem,
            note: intervention.note,
            price: intervention.price,
            toInvoice: intervention.toInvoice,
            interventionDateLabel: formatDayLabel(intervention.interventionDate),
            startTime: intervention.startTime,
            endTime: intervention.endTime,
        },
    };
};

interventionsRouter.get("/:id/print", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const context = await loadInterventionPrintContext(id);

    if (!context) {
        res.status(404).json({ message: "Intervento non trovato" });
        return;
    }

    const pdfBuffer = await createInterventionPdfBuffer(context.pdfData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=intervento-${id}.pdf`);
    res.send(pdfBuffer);
});

interventionsRouter.post("/:id/send-email", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    // Vedi services/emailSendRateLimit.ts. La rotta sta dietro `requireAuth`, quindi l'utente
    // c'è sempre; il ripiego tiene comunque in un unico contatore le chiamate senza utente.
    if (!consumeEmailSendSlot(String(req.user?.id ?? "senza-utente"))) {
        res.status(429).json({ message: "Troppe email inviate nell'ultima ora. Riprova più tardi." });
        return;
    }

    const context = await loadInterventionPrintContext(id);

    if (!context) {
        res.status(404).json({ message: "Intervento non trovato" });
        return;
    }

    if (!context.customerEmail) {
        res.status(400).json({ message: "Il cliente non ha un indirizzo email configurato" });
        return;
    }

    const [pdfBuffer, logo] = await Promise.all([createInterventionPdfBuffer(context.pdfData), loadPrintableLogo()]);

    const email = buildInterventionEmail({
        customerName: context.customerName,
        labName: context.labName,
        labEmail: context.labEmail,
        labAddress: context.labAddress,
        labPhone: context.labPhone,
        type: context.type,
        day: context.emailDay,
        logoCid: logo ? logoContentId : null,
    });

    await sendEmail({
        to: context.customerEmail,
        // Il testo invita a rispondere: la risposta deve arrivare al laboratorio, anche quando
        // il mittente SMTP è un'altra casella. Senza email del laboratorio si torna al mittente.
        replyTo: context.labEmail.trim() || undefined,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: [
            {
                // Il cliente archivia il PDF per data, non per numero di pratica.
                filename: `intervento-${context.emailDay}.pdf`,
                content: pdfBuffer,
                contentType: "application/pdf",
            },
            ...(logo
                ? [{ filename: "logo", content: logo.content, contentType: logo.contentType, cid: logoContentId }]
                : []),
        ],
    });

    res.json({ message: "Email inviata con successo" });
});

/** L'intervento con i nomi di cliente e collaboratore: vedi `getInterventionDetailById`. */
interventionsRouter.get("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const [intervention] = await getInterventionDetailById(id);

    if (!intervention) {
        res.status(404).json({ message: "Intervento non trovato" });
        return;
    }

    res.json(intervention);
});

interventionsRouter.post("/", validate({ body: interventionBodySchema }), async (req, res) => {
    const isOnSite = onSiteInterventionTypes.has(req.body.type);

    /**
     * Un'unica riga normalizzata, non una per la validazione e una per la scrittura: prima
     * `isOnSite ? (x ?? null) : null`, `description || null` e il default dello stato erano
     * calcolati due volte identici, col rischio che una modifica futura li disallineasse.
     * Per una creazione il corpo appena arrivato È la riga risultante: vedi
     * `validateInterventionRow`, la stessa funzione che la PUT chiama sulla riga unione.
     */
    const normalizedIntervention = {
        type: req.body.type,
        // Stringa vuota e campo assente sono la stessa cosa: "non ancora compilato" si
        // scrive NULL, come per `problem`.
        description: req.body.description || null,
        problem: isOnSite ? (req.body.problem ?? null) : null,
        note: req.body.note || null,
        price: req.body.price ?? null,
        paid: req.body.paid ?? false,
        toInvoice: req.body.toInvoice ?? false,
        status: req.body.status ?? "programmato",
        customerId: req.body.customerId,
        collaboratorId: req.body.collaboratorId,
        interventionDate: req.body.interventionDate ?? null,
        startTime: isOnSite ? (req.body.startTime ?? null) : null,
        endTime: isOnSite ? (req.body.endTime ?? null) : null,
    };

    const validationFailure = validateInterventionRow(normalizedIntervention);

    if (validationFailure) {
        res.status(400).json({ message: validationFailure.message });
        return;
    }

    const createdIntervention = await createIntervention(normalizedIntervention);

    res.status(201).json(createdIntervention[0]);
});

interventionsRouter.put(
    "/:id",
    validate({ params: idParamsSchema, body: interventionUpdateBodySchema }),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const existingRows = await getInterventionById(id);

        if (existingRows.length === 0) {
            res.status(404).json({ message: "Intervento non trovato" });
            return;
        }

        const existing = existingRows[0];
        const nextType: InterventionType = req.body.type ?? existing.type;
        const isOnSite = onSiteInterventionTypes.has(nextType);
        const nextInterventionDate =
            "interventionDate" in req.body ? (req.body.interventionDate ?? null) : existing.interventionDate;
        const nextStartTime = "startTime" in req.body ? (req.body.startTime ?? null) : existing.startTime;
        const nextEndTime = "endTime" in req.body ? (req.body.endTime ?? null) : existing.endTime;
        const nextProblem = "problem" in req.body ? (req.body.problem ?? null) : existing.problem;
        const nextStatus: InterventionStatus = req.body.status ?? existing.status;
        const nextDescription = "description" in req.body ? req.body.description || null : existing.description;
        const nextNote = "note" in req.body ? req.body.note || null : existing.note;

        // La combinazione da validare nasce dall'unione del corpo parziale con la riga
        // esistente, appena calcolata qui sopra: `validateInterventionRow` applica le stesse
        // regole di dominio della POST, sulla riga risultante di questa PUT.
        const validationFailure = validateInterventionRow({
            type: nextType,
            status: nextStatus,
            interventionDate: nextInterventionDate,
            description: nextDescription,
            problem: nextProblem,
            startTime: nextStartTime,
            endTime: nextEndTime,
        });

        if (validationFailure) {
            res.status(400).json({ message: validationFailure.message });
            return;
        }

        const updatedIntervention = await updateInterventionById(id, {
            ...req.body,
            interventionDate: nextInterventionDate,
            description: nextDescription,
            problem: isOnSite ? nextProblem : null,
            note: nextNote,
            startTime: isOnSite ? nextStartTime : null,
            endTime: isOnSite ? nextEndTime : null,
        });

        if (updatedIntervention.length === 0) {
            res.status(404).json({ message: "Intervento non trovato" });
            return;
        }

        res.json(updatedIntervention[0]);
    }
);

interventionsRouter.delete("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const deletedIntervention = await deleteInterventionById(id);

    if (deletedIntervention.length === 0) {
        res.status(404).json({ message: "Intervento non trovato" });
        return;
    }

    res.json(deletedIntervention[0]);
});

export default interventionsRouter;
