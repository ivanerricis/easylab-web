import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
    createIntervention,
    deleteInterventionById,
    getInterventionById,
    getInterventionStats,
    listInterventions,
    updateInterventionById,
} from "../db/queries/intervention";
import { db } from "../db";
import { collaboratorTable, customerTable, interventionTable } from "../db/schema";
import { sendEmail } from "../services/emailManager";
import { buildInterventionEmail } from "../services/interventionEmail";
import { createInterventionPdfBuffer } from "../services/interventionPdf";
import { loadImage } from "../services/pdf/shared";
import { getLabConfig } from "../config/lab";
import { formatDateLabel, formatDayLabel, formatPhoneLabel } from "./formatting";
import { idParamsSchema, listQuerySchema, sendListResponse } from "./crudRouter";
import { validate } from "./validation";

const interventionsRouter = Router();

// Riferimento che lega l'allegato inline all'`<img src="cid:...">` del corpo HTML.
const logoContentId = "logo-laboratorio";

/** La data di creazione arriva come `Date`: nel nome del file serve come YYYY-MM-DD. */
const toIsoDay = (value: Date) => value.toISOString().slice(0, 10);

const interventionTypes = ["consegna_materiale", "intervento_sede", "intervento_remoto"] as const;
type InterventionType = (typeof interventionTypes)[number];
const onSiteInterventionTypes = new Set<InterventionType>(["intervento_sede", "intervento_remoto"]);

const interventionStatuses = ["programmato", "in_lavorazione", "completato"] as const;

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
        status: z.enum(interventionStatuses).optional(),
        customerId: z.coerce.number().int().positive(),
        collaboratorId: z.coerce.number().int().positive(),
        interventionDate: z.string().regex(dateRegex).nullable().optional(),
        startTime: z.string().regex(timeRegex).nullable().optional(),
        endTime: z.string().regex(timeRegex).nullable().optional(),
    })
    .strict();

/**
 * Un intervento "programmato" è un lavoro che deve ancora essere svolto: l'orario esatto e
 * l'assistenza effettuata sono informazioni che nascono quando lo si fa, non quando lo si
 * mette in agenda. Restano invece obbligatorie negli altri due stati, altrimenti un
 * intervento potrebbe risultare completato senza che risulti cosa è stato fatto.
 *
 * Il problema riscontrato non segue questa regola: si conosce già al momento della chiamata
 * del cliente, ed è il motivo per cui l'intervento viene programmato.
 */
const isScheduledStatus = (status?: (typeof interventionStatuses)[number]) =>
    (status ?? "programmato") === "programmato";

const interventionCreateBodySchema = interventionBodySchema.superRefine((value, ctx) => {
    if (!value.interventionDate) {
        ctx.addIssue({ code: "custom", message: "La data dell'intervento è obbligatoria", path: ["interventionDate"] });
    }

    const scheduled = isScheduledStatus(value.status);

    if (!scheduled && !value.description) {
        ctx.addIssue({
            code: "custom",
            message: "La descrizione del lavoro svolto è obbligatoria quando l'intervento non è solo programmato",
            path: ["description"],
        });
    }

    if (!onSiteInterventionTypes.has(value.type)) {
        return;
    }

    if (!value.problem) {
        ctx.addIssue({ code: "custom", message: "Il problema riscontrato è obbligatorio", path: ["problem"] });
    }

    if (!scheduled && !value.startTime) {
        ctx.addIssue({ code: "custom", message: "L'ora di inizio è obbligatoria", path: ["startTime"] });
    }

    if (!scheduled && !value.endTime) {
        ctx.addIssue({ code: "custom", message: "L'ora di fine è obbligatoria", path: ["endTime"] });
    }

    // Vale anche per un intervento programmato: se gli orari ci sono, devono avere senso.
    if (value.startTime && value.endTime && value.startTime >= value.endTime) {
        ctx.addIssue({
            code: "custom",
            message: "L'ora di fine deve essere successiva all'ora di inizio",
            path: ["endTime"],
        });
    }
});

const interventionUpdateBodySchema = interventionBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
});

interventionsRouter.get("/", validate({ query: interventionListQuerySchema }), async (req, res) => {
    const {
        page,
        pageSize,
        search,
        status,
        type,
        dateFrom,
        dateTo,
        scheduledDate,
        scheduledFrom,
        scheduledTo,
        sortBy,
        sortOrder,
    } = req.query as unknown as {
        page?: number;
        pageSize?: number;
        search?: string;
        status?: "all" | (typeof interventionStatuses)[number];
        type?: "all" | InterventionType;
        dateFrom?: string;
        dateTo?: string;
        scheduledDate?: string;
        scheduledFrom?: string;
        scheduledTo?: string;
        sortBy?: (typeof interventionSortFields)[number];
        sortOrder?: "asc" | "desc";
    };

    const interventions = await listInterventions({
        page,
        pageSize,
        search,
        status: status ?? "all",
        type: type ?? "all",
        dateFrom,
        dateTo,
        scheduledDate,
        scheduledFrom,
        scheduledTo,
        sortBy,
        sortOrder,
    });

    sendListResponse(res, interventions, page, pageSize);
});

interventionsRouter.get("/stats", async (_req, res) => {
    const stats = await getInterventionStats();

    res.json(stats);
});

const loadInterventionPrintContext = async (
    id: number,
    req: { protocol: string; get: (name: string) => string | undefined }
) => {
    const interventionRows = await db
        .select({
            id: interventionTable.id,
            type: interventionTable.type,
            description: interventionTable.description,
            problem: interventionTable.problem,
            note: interventionTable.note,
            status: interventionTable.status,
            interventionDate: interventionTable.interventionDate,
            startTime: interventionTable.startTime,
            endTime: interventionTable.endTime,
            createdAt: interventionTable.created_at,
            customerFirstName: customerTable.firstName,
            customerLastName: customerTable.lastName,
            customerPhone: customerTable.phoneNumber,
            customerPhoneSecondary: customerTable.phoneNumberSecondary,
            customerEmail: customerTable.email,
            collaboratorFirstName: collaboratorTable.firstName,
            collaboratorLastName: collaboratorTable.lastName,
        })
        .from(interventionTable)
        .innerJoin(customerTable, eq(customerTable.id, interventionTable.customerId))
        .innerJoin(collaboratorTable, eq(collaboratorTable.id, interventionTable.collaboratorId))
        .where(eq(interventionTable.id, id));

    if (interventionRows.length === 0) {
        return null;
    }

    const intervention = interventionRows[0];
    const customerName = `${intervention.customerFirstName} ${intervention.customerLastName ?? ""}`.trim();
    const collaboratorName = `${intervention.collaboratorFirstName} ${intervention.collaboratorLastName ?? ""}`.trim();
    const { labName, labEmail, labAddress, labPhone, labLogoUrl } = await getLabConfig(req);
    const customerPhoneLabel = formatPhoneLabel(intervention.customerPhone, intervention.customerPhoneSecondary);

    return {
        customerName,
        customerEmail: intervention.customerEmail?.trim() || null,
        labName,
        labEmail,
        labAddress,
        labPhone,
        labLogoUrl,
        type: intervention.type as InterventionType,
        // Date grezze, per il nome del file allegato: le etichette formattate sono per
        // gli occhi del cliente, non per un nome di file.
        interventionDate: intervention.interventionDate,
        createdAt: intervention.createdAt,
        pdfData: {
            id: intervention.id,
            labName,
            labEmail,
            labAddress,
            labPhone,
            labLogoUrl,
            customerName,
            customerPhone: customerPhoneLabel,
            customerEmail: intervention.customerEmail?.trim() || "-",
            collaboratorName,
            type: intervention.type as InterventionType,
            status: intervention.status as (typeof interventionStatuses)[number],
            description: intervention.description,
            problem: intervention.problem,
            note: intervention.note,
            interventionDateLabel: intervention.interventionDate ? formatDayLabel(intervention.interventionDate) : null,
            startTime: intervention.startTime,
            endTime: intervention.endTime,
            createdAtLabel: formatDateLabel(intervention.createdAt),
        },
    };
};

interventionsRouter.get("/:id/print", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const context = await loadInterventionPrintContext(id, req);

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
    const context = await loadInterventionPrintContext(id, req);

    if (!context) {
        res.status(404).json({ message: "Intervento non trovato" });
        return;
    }

    if (!context.customerEmail) {
        res.status(400).json({ message: "Il cliente non ha un indirizzo email configurato" });
        return;
    }

    const [pdfBuffer, logo] = await Promise.all([
        createInterventionPdfBuffer(context.pdfData),
        loadImage(context.labLogoUrl),
    ]);

    const email = buildInterventionEmail({
        customerName: context.customerName,
        labName: context.labName,
        labEmail: context.labEmail,
        labAddress: context.labAddress,
        labPhone: context.labPhone,
        type: context.type,
        interventionDateLabel: context.pdfData.interventionDateLabel,
        createdAtLabel: context.pdfData.createdAtLabel,
        logoCid: logo ? logoContentId : null,
    });

    await sendEmail({
        to: context.customerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: [
            {
                // Il cliente archivia il PDF per data, non per numero di pratica.
                filename: `intervento-${context.interventionDate ?? toIsoDay(context.createdAt)}.pdf`,
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

interventionsRouter.get("/:id", validate({ params: idParamsSchema }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const intervention = await getInterventionById(id);

    if (intervention.length === 0) {
        res.status(404).json({ message: "Intervento non trovato" });
        return;
    }

    res.json(intervention[0]);
});

interventionsRouter.post("/", validate({ body: interventionCreateBodySchema }), async (req, res) => {
    const isOnSite = onSiteInterventionTypes.has(req.body.type);

    const createdIntervention = await createIntervention({
        type: req.body.type,
        // Stringa vuota e campo assente sono la stessa cosa: "non ancora compilato" si
        // scrive NULL, come per `problem`.
        description: req.body.description || null,
        problem: isOnSite ? (req.body.problem ?? null) : null,
        note: req.body.note || null,
        status: req.body.status ?? "programmato",
        customerId: req.body.customerId,
        collaboratorId: req.body.collaboratorId,
        interventionDate: req.body.interventionDate ?? null,
        startTime: isOnSite ? (req.body.startTime ?? null) : null,
        endTime: isOnSite ? (req.body.endTime ?? null) : null,
    });

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
        const nextType = (req.body.type ?? existing.type) as InterventionType;
        const isOnSite = onSiteInterventionTypes.has(nextType);
        const nextInterventionDate =
            "interventionDate" in req.body ? (req.body.interventionDate ?? null) : existing.interventionDate;
        const nextStartTime = "startTime" in req.body ? (req.body.startTime ?? null) : existing.startTime;
        const nextEndTime = "endTime" in req.body ? (req.body.endTime ?? null) : existing.endTime;
        const nextProblem = "problem" in req.body ? (req.body.problem ?? null) : existing.problem;
        const nextStatus = (req.body.status ?? existing.status) as (typeof interventionStatuses)[number];
        const nextDescription = "description" in req.body ? req.body.description || null : existing.description;
        const nextNote = "note" in req.body ? req.body.note || null : existing.note;
        // Come per il prezzo dei report: la combinazione da validare nasce dall'unione del
        // corpo parziale con la riga esistente, quindi lo schema non può vederla da solo.
        const scheduled = isScheduledStatus(nextStatus);

        if (!nextInterventionDate) {
            res.status(400).json({ message: "La data dell'intervento è obbligatoria" });
            return;
        }

        if (!scheduled && !nextDescription) {
            res.status(400).json({
                message: "La descrizione del lavoro svolto è obbligatoria quando l'intervento non è solo programmato",
            });
            return;
        }

        if (isOnSite && !nextProblem) {
            res.status(400).json({
                message: "Per interventi in sede o da remoto è richiesto il problema riscontrato",
            });
            return;
        }

        if (isOnSite && !scheduled && (!nextStartTime || !nextEndTime)) {
            res.status(400).json({
                message: "Per interventi in sede o da remoto sono richiesti ora inizio e ora fine",
            });
            return;
        }

        if (isOnSite && nextStartTime && nextEndTime && nextStartTime >= nextEndTime) {
            res.status(400).json({ message: "L'ora di fine deve essere successiva all'ora di inizio" });
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
