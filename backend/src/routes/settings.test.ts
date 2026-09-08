import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Tutti i servizi sono mockati: qui interessano soltanto i permessi e la validazione
// delle rotte, non cosa fanno backup, log o impostazioni una volta autorizzati.
vi.mock("../services/backupManager", () => ({
    getBackupDumpPath: vi.fn(),
    getBackupSettings: vi.fn().mockResolvedValue({}),
    listBackupDumps: vi.fn().mockResolvedValue([]),
    restoreBackupFromExisting: vi.fn(),
    restoreBackupFromUpload: vi.fn(),
    runBackupNow: vi.fn(),
    testSmbConnection: vi.fn(),
    updateBackupSettings: vi.fn(),
}));
vi.mock("../services/companyManager", () => ({
    getCompanySettings: vi.fn().mockResolvedValue({ name: "EasyLab" }),
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
vi.mock("../services/updateManager", () => ({
    getUpdateStatus: vi.fn().mockResolvedValue({ state: "idle" }),
    requestUpdate: vi.fn(),
    requestUpdateCheck: vi.fn(),
}));

import settingsRouter from "./settings";
import { errorHandler } from "../middleware/errorHandler";
import { testSmbConnection, updateBackupSettings } from "../services/backupManager";

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

    it.each(["/api/settings/company", "/api/settings/logo"])(
        "lascia leggere %s a chiunque sia autenticato",
        async (path) => {
            const response = await request(buildApp(false)).get(path);

            expect(response.status).toBe(200);
        }
    );

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
            outputDir: "backups",
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
