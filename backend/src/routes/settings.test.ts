import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Tutti i servizi sono mockati: qui interessano soltanto i permessi e la validazione
// delle rotte, non cosa fanno backup, log o impostazioni una volta autorizzati.
vi.mock("../services/backupManager", () => ({
    exportBackupKey: vi.fn().mockResolvedValue("ab".repeat(32)),
    getBackupDumpPath: vi.fn(),
    getBackupSettings: vi.fn().mockResolvedValue({}),
    listBackupDumps: vi.fn().mockResolvedValue([]),
    restoreBackupFromExisting: vi.fn(),
    restoreBackupFromUpload: vi.fn(),
    runBackupNow: vi.fn(),
    testSmbConnection: vi.fn(),
    updateBackupSettings: vi.fn(),
    refreshBackupSchedule: vi.fn(),
}));
// `canonicalTimeZone` resta quello vero: la rotta lo usa per validare il fuso.
vi.mock("../services/companyManager", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../services/companyManager")>()),
    getCompanySettings: vi.fn().mockResolvedValue({ name: "EasyLab", timeZone: "Europe/Rome" }),
    updateCompanySettings: vi.fn(),
}));
vi.mock("../services/emailManager", () => ({
    getEmailSettings: vi.fn().mockResolvedValue({}),
    testEmailConnection: vi.fn(),
    updateEmailSettings: vi.fn(),
}));
vi.mock("../services/logoManager", () => ({
    getLogoStatus: vi.fn().mockResolvedValue({ hasCustomLogo: false, updatedAt: null }),
    resetLogo: vi.fn(),
    saveLogo: vi.fn(),
}));
vi.mock("../services/logManager", () => ({
    getLogFilePath: vi.fn(),
    listLogFiles: vi.fn().mockResolvedValue([]),
    readLogEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock("../services/authManager", () => ({
    assertOwnPassword: vi.fn(),
}));
vi.mock("../services/updateManager", () => ({
    getUpdateStatus: vi.fn().mockResolvedValue({
        state: "idle",
        currentCommit: "a1b2c3d",
        lastError: "Aggiornamento fallito (exit 1)",
        log: "=== git fetch ===",
    }),
    requestUpdate: vi.fn(),
    requestUpdateCheck: vi.fn(),
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import settingsRouter from "./settings";
import { errorHandler } from "../middleware/errorHandler";
import { ApiError } from "../services/apiError";
import {
    getBackupDumpPath,
    refreshBackupSchedule,
    restoreBackupFromExisting,
    restoreBackupFromUpload,
    runBackupNow,
    testSmbConnection,
    updateBackupSettings,
} from "../services/backupManager";
import { updateCompanySettings } from "../services/companyManager";
import { testEmailConnection, updateEmailSettings } from "../services/emailManager";
import { resetLogo, saveLogo } from "../services/logoManager";
import { getLogFilePath, readLogEntries } from "../services/logManager";
import { requestUpdate, requestUpdateCheck } from "../services/updateManager";
import { assertOwnPassword } from "../services/authManager";

const buildApp = (isAdmin: boolean) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = {
            id: 1,
            username: "mario",
            createdAt: "",
            mustChangePassword: false,
            twoFactorEnabled: false,
            twoFactorSetupRequired: false,
            active: true,
            isAdmin,
        };
        next();
    });
    app.use("/api/settings", settingsRouter);
    app.use(errorHandler);
    return app;
};

const smbBody = (path: string) => ({
    host: "nas.local",
    share: "backup",
    path,
    domain: "",
    port: 445,
    username: "easylab",
    password: "segreta",
});

describe("settings router: permessi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Il dump contiene gli hash delle password di tutti gli utenti: poterlo scaricare
    // equivale ad amministrare la macchina, non a consultare un'impostazione.
    it.each([
        ["get", "/api/settings/backup/download/db-backup-20260101-120000.tar.gz"],
        ["get", "/api/settings/backup/list"],
        ["get", "/api/settings/backup/key"],
        ["get", "/api/settings/logs"],
        ["get", "/api/settings/email"],
        ["get", "/api/settings/update"],
        ["put", "/api/settings/company"],
        ["post", "/api/settings/backup/run"],
        ["post", "/api/settings/backup/smb/test"],
        ["post", "/api/settings/update/run"],
    ] as const)("nega a un utente non amministratore %s %s", async (method, path) => {
        const response = await request(buildApp(false))[method](path).send({});

        expect(response.status).toBe(403);
    });

    it.each(["/api/settings/company", "/api/settings/logo", "/api/settings/update-state"])(
        "lascia leggere %s a chiunque sia autenticato",
        async (path) => {
            const response = await request(buildApp(false)).get(path);

            expect(response.status).toBe(200);
        }
    );

    // La rotta esiste perché ogni scheda aperta sappia se un aggiornamento è in corso: deve
    // dire quello e basta, non diventare la versione libera di /update.
    it("espone solo lo stato dell'aggiornamento, non commit, log ed errori", async () => {
        const response = await request(buildApp(false)).get("/api/settings/update-state");

        expect(response.body).toEqual({ state: "idle" });
    });

    it("lascia passare l'amministratore sulle rotte protette", async () => {
        const response = await request(buildApp(true)).get("/api/settings/logs");

        expect(response.status).toBe(200);
    });
});

describe("settings router: cartella remota SMB", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rifiuta un percorso che smbclient interpreterebbe come comandi", async () => {
        const response = await request(buildApp(true))
            .post("/api/settings/backup/smb/test")
            .send(smbBody("backup; get payload /app/dist/index.js; echo "));

        expect(response.status).toBe(400);
        expect(testSmbConnection).not.toHaveBeenCalled();
    });

    it("rifiuta lo stesso percorso anche quando viene salvato nelle impostazioni", async () => {
        const response = await request(buildApp(true)).put("/api/settings/backup").send({
            autoEnabled: true,
            frequencyDays: 1,
            runAt: "02:00",
            maxBackupsToKeep: 14,
            notifyEmailOnFailure: false,
            smbEnabled: true,
            smbHost: "nas.local",
            smbShare: "backup",
            smbPath: 'x"; put /app/data/secret.key rubata; echo "',
            smbDomain: "",
            smbPort: 445,
            smbUsername: "easylab",
        });

        expect(response.status).toBe(400);
        expect(updateBackupSettings).not.toHaveBeenCalled();
    });

    it("accetta un percorso normale", async () => {
        vi.mocked(testSmbConnection).mockResolvedValue(undefined);

        const response = await request(buildApp(true))
            .post("/api/settings/backup/smb/test")
            .send(smbBody("backup/easylab"));

        expect(response.status).toBe(200);
        expect(testSmbConnection).toHaveBeenCalledOnce();
    });
});

describe("settings router: chiave di backup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Non è un segreto dell'app come la password SMB: l'amministratore deve poterla
    // rileggere per esportarla e conservarla altrove (vedi services/backupKey.ts).
    it("l'amministratore può esportare la chiave di backup", async () => {
        const response = await request(buildApp(true)).get("/api/settings/backup/key");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ key: "ab".repeat(32) });
    });

    it("rifiuta una chiave incollata di lunghezza sbagliata nel ripristino", async () => {
        const response = await request(buildApp(true)).post("/api/settings/backup/restore").send({
            fileName: "db-backup-20260101-120000.tar.gz",
            resetSchema: false,
            backupKey: "troppo-corta",
            password: "segreta",
        });

        expect(response.status).toBe(400);
    });
});

describe("settings router: registro delle azioni", () => {
    const entries = [
        { action: "POST /api/reports", ip: "10.0.0.1", user: "mario", error: null },
        { action: "DELETE /api/customers/3", ip: "10.0.0.2", user: "anna", error: "Vincolo di integrità" },
        { action: "PUT /api/devices/1", ip: "10.0.0.1", user: "Mario", error: null },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readLogEntries).mockResolvedValue(entries as never);
    });

    it("pagina le voci del giorno e calcola il numero di pagine", async () => {
        const response = await request(buildApp(true)).get("/api/settings/logs/2026-09-14?page=2&pageSize=2");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ totalItems: 3, page: 2, pageSize: 2, totalPages: 2 });
        expect(response.body.items).toEqual([entries[2]]);
        expect(readLogEntries).toHaveBeenCalledWith("2026-09-14");
    });

    it("cerca senza distinguere maiuscole in azione, indirizzo, utente ed errore", async () => {
        const byUser = await request(buildApp(true)).get("/api/settings/logs/2026-09-14?search=MARIO");
        const byError = await request(buildApp(true)).get("/api/settings/logs/2026-09-14?search=vincolo");

        expect(byUser.body.items).toEqual([entries[0], entries[2]]);
        expect(byError.body.items).toEqual([entries[1]]);
    });

    it("un giorno senza voci ha comunque una pagina", async () => {
        vi.mocked(readLogEntries).mockResolvedValue([]);

        const response = await request(buildApp(true)).get("/api/settings/logs/2026-09-14");

        expect(response.body).toMatchObject({ items: [], totalItems: 0, page: 1, pageSize: 50, totalPages: 1 });
    });

    it("rifiuta una data che non è una data, prima di toccare il disco", async () => {
        const response = await request(buildApp(true)).get("/api/settings/logs/..%2F..%2Fetc");

        expect(response.status).toBe(400);
        expect(readLogEntries).not.toHaveBeenCalled();
    });

    it("rifiuta una pagina più grande del massimo", async () => {
        const response = await request(buildApp(true)).get("/api/settings/logs/2026-09-14?pageSize=1000000");

        expect(response.status).toBe(400);
    });
});

describe("settings router: download di log e backup", () => {
    let tempDir: string;

    beforeEach(() => {
        vi.clearAllMocks();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-test-"));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("scarica il log del giorno come allegato", async () => {
        const logPath = path.join(tempDir, "2026-09-14.log");
        fs.writeFileSync(logPath, "riga di log\n");
        vi.mocked(getLogFilePath).mockReturnValue(logPath);

        const response = await request(buildApp(true)).get("/api/settings/logs/2026-09-14/download");

        expect(response.status).toBe(200);
        expect(response.headers["content-disposition"]).toContain('filename="2026-09-14.log"');
    });

    it("un log che non esiste risponde 404 con un messaggio", async () => {
        vi.mocked(getLogFilePath).mockReturnValue(path.join(tempDir, "assente.log"));

        const response = await request(buildApp(true)).get("/api/settings/logs/2026-09-14/download");

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Log non trovato");
    });

    it("scarica un backup esistente con il suo nome", async () => {
        const dumpPath = path.join(tempDir, "db-backup-20260914-020000.tar.gz");
        fs.writeFileSync(dumpPath, "archivio");
        vi.mocked(getBackupDumpPath).mockResolvedValue(dumpPath);

        const response = await request(buildApp(true)).get(
            "/api/settings/backup/download/db-backup-20260914-020000.tar.gz"
        );

        expect(response.status).toBe(200);
        expect(response.headers["content-disposition"]).toContain("db-backup-20260914-020000.tar.gz");
        expect(getBackupDumpPath).toHaveBeenCalledWith("db-backup-20260914-020000.tar.gz");
    });

    it("un nome rifiutato dal servizio arriva al client con il suo stato", async () => {
        vi.mocked(getBackupDumpPath).mockRejectedValue(new ApiError("Nome file non valido", 400));

        const response = await request(buildApp(true)).get("/api/settings/backup/download/qualsiasi.txt");

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Nome file non valido");
    });

    it("un backup sparito dal disco fra il controllo e la lettura risponde 404", async () => {
        vi.mocked(getBackupDumpPath).mockResolvedValue(path.join(tempDir, "db-backup-20260914-020000.tar.gz"));

        const response = await request(buildApp(true)).get(
            "/api/settings/backup/download/db-backup-20260914-020000.tar.gz"
        );

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("File di dump non trovato");
    });
});

describe("settings router: esecuzione e ripristino del backup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("un backup lanciato a mano risponde 201 ed è registrato come manuale", async () => {
        vi.mocked(runBackupNow).mockResolvedValue({ message: "Dump completato con successo" } as never);

        const response = await request(buildApp(true)).post("/api/settings/backup/run");

        expect(response.status).toBe(201);
        expect(runBackupNow).toHaveBeenCalledWith("manual");
    });

    it("ripristina un backup esistente passando la chiave incollata", async () => {
        vi.mocked(restoreBackupFromExisting).mockResolvedValue({} as never);
        const key = "cd".repeat(32);

        const response = await request(buildApp(true)).post("/api/settings/backup/restore").send({
            fileName: " db-backup-20260101-120000.tar.gz ",
            resetSchema: true,
            backupKey: key,
            password: "segreta",
        });

        expect(response.status).toBe(200);
        expect(assertOwnPassword).toHaveBeenCalledWith(1, "segreta");
        expect(restoreBackupFromExisting).toHaveBeenCalledWith("db-backup-20260101-120000.tar.gz", true, key);
    });

    /**
     * Il ripristino sostituisce il database: come le altre operazioni che non si annullano chiede
     * di nuovo la password, così una sessione rubata o una pagina che la sfrutta non bastano.
     */
    it("senza password il ripristino di un backup esistente risponde 400 e non tocca nulla", async () => {
        const response = await request(buildApp(true))
            .post("/api/settings/backup/restore")
            .send({ fileName: "db-backup-20260101-120000.tar.gz", resetSchema: false });

        expect(response.status).toBe(400);
        expect(restoreBackupFromExisting).not.toHaveBeenCalled();
    });

    it("con la password sbagliata il ripristino si ferma prima di cominciare", async () => {
        vi.mocked(assertOwnPassword).mockRejectedValueOnce(new ApiError("La password non è corretta", 400));

        const existing = await request(buildApp(true))
            .post("/api/settings/backup/restore")
            .send({ fileName: "db-backup-20260101-120000.tar.gz", resetSchema: false, password: "sbagliata" });

        vi.mocked(assertOwnPassword).mockRejectedValueOnce(new ApiError("La password non è corretta", 400));

        const upload = await request(buildApp(true))
            .post("/api/settings/backup/restore/upload")
            .field("password", "sbagliata")
            .attach("dump", Buffer.from("-- dump"), "dump.sql");

        expect(existing.status).toBe(400);
        expect(upload.status).toBe(400);
        expect(upload.body.message).toBe("La password non è corretta");
        expect(restoreBackupFromExisting).not.toHaveBeenCalled();
        expect(restoreBackupFromUpload).not.toHaveBeenCalled();
    });

    it("senza password il ripristino da file caricato risponde 400", async () => {
        const response = await request(buildApp(true))
            .post("/api/settings/backup/restore/upload")
            .attach("dump", Buffer.from("-- dump"), "dump.sql");

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/password/);
        expect(assertOwnPassword).not.toHaveBeenCalled();
        expect(restoreBackupFromUpload).not.toHaveBeenCalled();
    });

    it("il ripristino da file caricato senza file risponde 400", async () => {
        const response = await request(buildApp(true)).post("/api/settings/backup/restore/upload");

        expect(response.status).toBe(400);
        expect(restoreBackupFromUpload).not.toHaveBeenCalled();
    });

    it("il ripristino da file caricato legge le opzioni dal form, e una chiave vuota non conta", async () => {
        vi.mocked(restoreBackupFromUpload).mockResolvedValue({} as never);

        const response = await request(buildApp(true))
            .post("/api/settings/backup/restore/upload")
            .field("resetSchema", "true")
            .field("backupKey", "   ")
            .field("password", "segreta")
            .attach("dump", Buffer.from("-- dump"), "db-backup-20260914-020000.tar.gz");

        expect(response.status).toBe(200);
        const [buffer, originalName, resetSchema, backupKey] = vi.mocked(restoreBackupFromUpload).mock.calls[0];
        expect(buffer.toString()).toBe("-- dump");
        expect(originalName).toBe("db-backup-20260914-020000.tar.gz");
        expect(resetSchema).toBe(true);
        expect(backupKey).toBeUndefined();
    });

    it('qualunque valore diverso da "true" non azzera lo schema', async () => {
        vi.mocked(restoreBackupFromUpload).mockResolvedValue({} as never);

        await request(buildApp(true))
            .post("/api/settings/backup/restore/upload")
            .field("resetSchema", "si")
            .field("password", "segreta")
            .field("backupKey", ` ${"ef".repeat(32)} `)
            .attach("dump", Buffer.from("-- dump"), "dump.sql");

        const [, , resetSchema, backupKey] = vi.mocked(restoreBackupFromUpload).mock.calls[0];
        expect(resetSchema).toBe(false);
        expect(backupKey).toBe("ef".repeat(32));
    });
});

describe("settings router: logo, azienda, email e aggiornamento", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("carica il logo e risponde 201", async () => {
        vi.mocked(saveLogo).mockResolvedValue({ hasCustomLogo: true, updatedAt: "2026-09-14" } as never);

        const response = await request(buildApp(true))
            .post("/api/settings/logo")
            .attach("logo", Buffer.from("png"), "logo.png");

        expect(response.status).toBe(201);
        expect(vi.mocked(saveLogo).mock.calls[0][0].toString()).toBe("png");
    });

    it("senza file il logo risponde 400", async () => {
        const response = await request(buildApp(true)).post("/api/settings/logo");

        expect(response.status).toBe(400);
        expect(saveLogo).not.toHaveBeenCalled();
    });

    it("un logo oltre i 5 MB risponde 413 senza arrivare al servizio", async () => {
        const response = await request(buildApp(true))
            .post("/api/settings/logo")
            .attach("logo", Buffer.alloc(5 * 1024 * 1024 + 1), "enorme.png");

        expect(response.status).toBe(413);
        expect(saveLogo).not.toHaveBeenCalled();
    });

    it("toglie il logo personalizzato", async () => {
        vi.mocked(resetLogo).mockResolvedValue({ hasCustomLogo: false, updatedAt: null } as never);

        const response = await request(buildApp(true)).delete("/api/settings/logo");

        expect(response.status).toBe(200);
        expect(resetLogo).toHaveBeenCalledOnce();
    });

    it("salva i dati dell'azienda ripuliti dagli spazi, e rifiuta un nome vuoto", async () => {
        vi.mocked(updateCompanySettings).mockResolvedValue({} as never);

        const saved = await request(buildApp(true))
            .put("/api/settings/company")
            .send({ name: " Laboratorio ", email: "", address: "", phone: "" });
        const empty = await request(buildApp(true))
            .put("/api/settings/company")
            .send({ name: "  ", email: "", address: "", phone: "" });

        expect(saved.status).toBe(200);
        expect(updateCompanySettings).toHaveBeenCalledWith({ name: "Laboratorio", email: "", address: "", phone: "" });
        expect(empty.status).toBe(400);
    });

    it("accetta un fuso orario valido e rifiuta uno inventato", async () => {
        vi.mocked(updateCompanySettings).mockResolvedValue({ timeZone: "Europe/Rome" } as never);
        const body = { name: "Laboratorio", email: "", address: "", phone: "" };

        const valid = await request(buildApp(true))
            .put("/api/settings/company")
            .send({ ...body, timeZone: "Europe/Rome" });
        const invented = await request(buildApp(true))
            .put("/api/settings/company")
            .send({ ...body, timeZone: "Europa/Roma" });

        expect(valid.status).toBe(200);
        expect(invented.status).toBe(400);
        expect(updateCompanySettings).toHaveBeenCalledTimes(1);
        // Stesso fuso di prima: il prossimo backup resta dov'era.
        expect(refreshBackupSchedule).not.toHaveBeenCalled();
    });

    it("se il fuso cambia ricalcola il prossimo backup, partendo dal fuso precedente", async () => {
        vi.mocked(updateCompanySettings).mockResolvedValue({ timeZone: "Asia/Tokyo" } as never);

        const response = await request(buildApp(true))
            .put("/api/settings/company")
            .send({ name: "Laboratorio", email: "", address: "", phone: "", timeZone: "Asia/Tokyo" });

        expect(response.status).toBe(200);
        expect(refreshBackupSchedule).toHaveBeenCalledWith("Europe/Rome");
    });

    const emailBody = {
        enabled: true,
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: "lab",
        fromName: "Laboratorio",
        fromEmail: "lab@example.com",
    };

    it("salva le impostazioni email, senza obbligare a reinserire la password", async () => {
        vi.mocked(updateEmailSettings).mockResolvedValue({} as never);

        const response = await request(buildApp(true)).put("/api/settings/email").send(emailBody);

        expect(response.status).toBe(200);
        expect(updateEmailSettings).toHaveBeenCalledWith(emailBody);
    });

    it("rifiuta campi sconosciuti nelle impostazioni email", async () => {
        const response = await request(buildApp(true))
            .put("/api/settings/email")
            .send({ ...emailBody, smtpCommand: "x" });

        expect(response.status).toBe(400);
        expect(updateEmailSettings).not.toHaveBeenCalled();
    });

    it("la mail di prova conferma l'indirizzo a cui è partita", async () => {
        vi.mocked(testEmailConnection).mockResolvedValue(undefined as never);

        const response = await request(buildApp(true))
            .post("/api/settings/email/test")
            .send({ ...emailBody, enabled: undefined, password: "segreta" });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("Email di prova inviata con successo a lab@example.com");
    });

    it("la mail di prova rifiuta un mittente che non è un indirizzo", async () => {
        const response = await request(buildApp(true))
            .post("/api/settings/email/test")
            .send({ ...emailBody, enabled: undefined, password: "segreta", fromEmail: "non-una-mail" });

        expect(response.status).toBe(400);
        expect(testEmailConnection).not.toHaveBeenCalled();
    });

    it("avvio e controllo dell'aggiornamento rispondono 202: il lavoro prosegue sull'host", async () => {
        vi.mocked(requestUpdate).mockResolvedValue({ state: "requested" } as never);
        vi.mocked(requestUpdateCheck).mockResolvedValue({ state: "checking" } as never);

        const run = await request(buildApp(true)).post("/api/settings/update/run");
        const check = await request(buildApp(true)).post("/api/settings/update/check");

        expect(run.status).toBe(202);
        expect(check.status).toBe(202);
        expect(requestUpdate).toHaveBeenCalledOnce();
        expect(requestUpdateCheck).toHaveBeenCalledOnce();
    });
});
