import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { validate } from "./validation";
import { requireAdmin } from "../middleware/requireAuth";
import {
    getBackupDumpPath,
    getBackupSettings,
    listBackupDumps,
    restoreBackupFromExisting,
    restoreBackupFromUpload,
    runBackupNow,
    testSmbConnection,
    updateBackupSettings,
} from "../services/backupManager";
import { maxPageSize } from "../db/queries/pagination";
import { smbPathPattern, smbPathRequirementsMessage } from "../services/backupSmb";
import { getCompanySettings, updateCompanySettings } from "../services/companyManager";
import { getEmailSettings, testEmailConnection, updateEmailSettings } from "../services/emailManager";
import { getLogoStatus, resetLogo, saveLogo } from "../services/logoManager";
import { getLogFilePath, listLogFiles, readLogEntries } from "../services/logManager";
import { getUpdateStatus, requestUpdate, requestUpdateCheck } from "../services/updateManager";

// Le rotte qui sotto non hanno try/catch: i servizi sollevano `ApiError` (messaggio e
// status già decisi da chi sa cosa è andato storto) ed Express 5 inoltra da solo il
// rifiuto di un handler async a `middleware/errorHandler.ts`, che lo traduce in risposta.
// Prima ogni famiglia di impostazioni aveva la propria classe d'errore identica alle
// altre e la propria copia del codice di traduzione, ripetuta in ogni rotta.

const settingsRouter = Router();

// La cartella remota finisce nella stringa di comandi di smbclient: senza una whitelist
// lascia scegliere al chiamante quali comandi smbclient esegue, e fra questi ci sono `get`
// e `put`, che leggono e scrivono file del container (vedi services/backupSmb.ts). Validarla
// già qui dà all'utente un 400 con un messaggio comprensibile invece di un errore
// generico sollevato più a valle.
const smbPathSchema = z.string().trim().max(512).regex(smbPathPattern, smbPathRequirementsMessage);
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
// Il dump viene tenuto in memoria per intero, quindi senza un tetto una sola richiesta
// basta a esaurire la RAM del container. 512 MB sono molto sopra i dump reali del
// laboratorio e sotto il limite di 100 MB per richiesta del piano Cloudflare, che nella
// pratica taglia prima: un archivio più grande va ripristinato dalla VM con
// scripts/restore-db.sh, come già documentato per lo stesso motivo in nginx.conf.
const maxDumpUploadBytes = 512 * 1024 * 1024;
const dumpUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxDumpUploadBytes } });

const backupSettingsSchema = z
    .object({
        autoEnabled: z.boolean(),
        frequencyDays: z.coerce.number().int().min(1).max(365),
        runAt: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        outputDir: z.string().trim().min(1).max(512),
        maxBackupsToKeep: z.coerce.number().int().min(1).max(365),
        notifyEmailOnFailure: z.boolean(),
        smbEnabled: z.boolean(),
        smbHost: z.string().trim().max(255),
        smbShare: z.string().trim().max(255),
        smbPath: smbPathSchema,
        smbDomain: z.string().trim().max(255),
        smbPort: z.coerce.number().int().min(1).max(65535),
        smbUsername: z.string().trim().max(255),
        smbPassword: z.string().max(512).optional(),
    })
    .strict();

const backupRestoreSchema = z
    .object({
        fileName: z.string().trim().min(1).max(255),
        resetSchema: z.boolean(),
    })
    .strict();

const smbTestSchema = z
    .object({
        host: z.string().trim().min(1).max(255),
        share: z.string().trim().min(1).max(255),
        path: smbPathSchema,
        domain: z.string().trim().max(255),
        port: z.coerce.number().int().min(1).max(65535),
        username: z.string().trim().min(1).max(255),
        password: z.string().min(1).max(512),
    })
    .strict();

const companySettingsSchema = z
    .object({
        name: z.string().trim().min(1).max(255),
        email: z.string().trim().max(255),
        address: z.string().trim().max(512),
        phone: z.string().trim().max(50),
    })
    .strict();

const emailSettingsSchema = z
    .object({
        enabled: z.boolean(),
        host: z.string().trim().max(255),
        port: z.coerce.number().int().min(1).max(65535),
        secure: z.boolean(),
        username: z.string().trim().max(255),
        password: z.string().max(512).optional(),
        fromName: z.string().trim().max(255),
        fromEmail: z.string().trim().max(255),
    })
    .strict();

const emailTestSchema = z
    .object({
        host: z.string().trim().min(1).max(255),
        port: z.coerce.number().int().min(1).max(65535),
        secure: z.boolean(),
        username: z.string().trim().min(1).max(255),
        password: z.string().min(1).max(512),
        fromName: z.string().trim().max(255),
        fromEmail: z.string().trim().min(1).email().max(255),
    })
    .strict();

const logDayKeyParamsSchema = z
    .object({
        dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict();

const logEntriesQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(maxPageSize).optional(),
        search: z.string().trim().max(255).optional(),
    })
    .strict();

// Le uniche due letture lasciate a chiunque sia autenticato: sono i dati che l'app mostra
// già in giro per l'interfaccia (nome del laboratorio, presenza di un logo), non
// contengono nulla di riservato e non permettono di cambiare niente.
settingsRouter.get("/company", async (_req, res) => {
    res.json(await getCompanySettings());
});

settingsRouter.get("/logo", async (_req, res) => {
    res.json(await getLogoStatus());
});

/**
 * Tutto il resto delle impostazioni è riservato all'amministratore.
 *
 * Prima bastava essere autenticati: un utente qualsiasi poteva scaricare un dump completo
 * del database - che contiene gli hash delle password di tutti e i segreti cifrati - leggere
 * il registro delle azioni altrui, riconfigurare NAS e SMTP e far partire connessioni verso
 * host e porte a scelta. Sono operazioni di amministrazione della macchina, non preferenze:
 * un singolo account compromesso non deve bastare per arrivarci.
 */
settingsRouter.use(requireAdmin);

settingsRouter.get("/logs", async (_req, res) => {
    res.json(await listLogFiles());
});

settingsRouter.get(
    "/logs/:dayKey",
    validate({ params: logDayKeyParamsSchema, query: logEntriesQuerySchema }),
    async (req, res) => {
        const { dayKey } = req.params as { dayKey: string };
        const {
            page = 1,
            pageSize = 50,
            search,
        } = req.query as {
            page?: number;
            pageSize?: number;
            search?: string;
        };

        const allEntries = await readLogEntries(dayKey);
        const normalizedSearch = search?.toLowerCase();
        const filteredEntries = normalizedSearch
            ? allEntries.filter((entry) =>
                  `${entry.action} ${entry.ip} ${entry.user} ${entry.error ?? ""}`
                      .toLowerCase()
                      .includes(normalizedSearch)
              )
            : allEntries;

        const totalItems = filteredEntries.length;
        const startIndex = (page - 1) * pageSize;
        const items = filteredEntries.slice(startIndex, startIndex + pageSize);

        res.json({
            items,
            totalItems,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
        });
    }
);

settingsRouter.get("/logs/:dayKey/download", validate({ params: logDayKeyParamsSchema }), async (req, res) => {
    const { dayKey } = req.params as { dayKey: string };
    const filePath = getLogFilePath(dayKey);

    res.download(filePath, path.basename(filePath), (error) => {
        if (error && !res.headersSent) {
            res.status(404).json({ message: "Log non trovato" });
        }
    });
});

settingsRouter.get("/backup", async (_req, res) => {
    res.json(await getBackupSettings());
});

settingsRouter.put("/backup", validate({ body: backupSettingsSchema }), async (req, res) => {
    res.json(await updateBackupSettings(req.body));
});

settingsRouter.post("/backup/run", async (_req, res) => {
    res.status(201).json(await runBackupNow("manual"));
});

settingsRouter.post("/backup/smb/test", validate({ body: smbTestSchema }), async (req, res) => {
    await testSmbConnection(req.body);
    res.json({ message: "Connessione al NAS riuscita" });
});

settingsRouter.put("/company", validate({ body: companySettingsSchema }), async (req, res) => {
    res.json(await updateCompanySettings(req.body));
});

settingsRouter.get("/email", async (_req, res) => {
    res.json(await getEmailSettings());
});

settingsRouter.put("/email", validate({ body: emailSettingsSchema }), async (req, res) => {
    res.json(await updateEmailSettings(req.body));
});

settingsRouter.post("/email/test", validate({ body: emailTestSchema }), async (req, res) => {
    await testEmailConnection(req.body);
    res.json({ message: `Email di prova inviata con successo a ${req.body.fromEmail}` });
});

settingsRouter.post("/logo", logoUpload.single("logo"), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ message: "Nessun file caricato" });
        return;
    }

    res.status(201).json(await saveLogo(req.file.buffer, req.file.mimetype));
});

settingsRouter.delete("/logo", async (_req, res) => {
    res.json(await resetLogo());
});

settingsRouter.get("/backup/list", async (_req, res) => {
    res.json(await listBackupDumps());
});

settingsRouter.get("/backup/download/:fileName", async (req, res) => {
    const filePath = await getBackupDumpPath(req.params.fileName);

    res.download(filePath, path.basename(filePath), (error) => {
        if (error && !res.headersSent) {
            res.status(404).json({ message: "File di dump non trovato" });
        }
    });
});

settingsRouter.post("/backup/restore", validate({ body: backupRestoreSchema }), async (req, res) => {
    const { fileName, resetSchema } = req.body as { fileName: string; resetSchema: boolean };

    res.json(await restoreBackupFromExisting(fileName, resetSchema));
});

settingsRouter.post("/backup/restore/upload", dumpUpload.single("dump"), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ message: "Nessun file caricato" });
        return;
    }

    const resetSchema = req.body.resetSchema === "true";

    res.json(await restoreBackupFromUpload(req.file.buffer, req.file.originalname, resetSchema));
});

// Le rotte di aggiornamento sono il caso più delicato di tutti: non modificano una
// preferenza, eseguono sull'host il codice presente su origin/main e ricostruiscono lo
// stack. Come il resto del router, sono coperte dal requireAdmin qui sopra.
settingsRouter.get("/update", async (_req, res) => {
    res.json(await getUpdateStatus());
});

settingsRouter.post("/update/run", async (_req, res) => {
    res.status(202).json(await requestUpdate());
});

settingsRouter.post("/update/check", async (_req, res) => {
    res.status(202).json(await requestUpdateCheck());
});

export default settingsRouter;
