import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'app intera, con i router veri: qui si verifica l'ordine delle guardie montate in
 * `app.ts`, che nessun test di router isolato vede. Ogni router ha i propri test, e le
 * richieste di questo file si fermano tutte prima di arrivare al database — le guardie
 * rispondono da sole, o il servizio chiamato è mockato.
 */
const { getSessionUser, listUsers, getTwoFactorStatus } = vi.hoisted(() => ({
    getSessionUser: vi.fn(),
    listUsers: vi.fn(),
    getTwoFactorStatus: vi.fn(),
}));

vi.mock("./services/authManager", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./services/authManager")>()),
    getSessionUser,
    listUsers,
    getTwoFactorStatus,
}));

// Il registro delle azioni scriverebbe nella vera cartella logs/.
vi.mock("./services/logManager", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./services/logManager")>()),
    appendUserActionLog: () => Promise.resolve(),
}));

const logoDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-test-logo-"));
const logoPath = path.join(logoDir, "logo.svg");

vi.mock("./services/logoManager", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./services/logoManager")>()),
    getLogoFile: () => Promise.resolve({ filePath: logoPath, mimeType: "image/svg+xml" }),
}));

import app from "./app";
import { sessionCookieName } from "./middleware/requireAuth";

const user = {
    id: 2,
    username: "mario",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
    twoFactorSetupRequired: false,
};

const withSession = (test: request.Test) => test.set("Cookie", `${sessionCookieName}=un-token`);

beforeAll(() => {
    fs.writeFileSync(logoPath, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
});

afterAll(() => {
    fs.rmSync(logoDir, { recursive: true, force: true });
});

beforeEach(() => {
    vi.clearAllMocks();
    // Il log per richiesta va su stdout: qui è solo rumore.
    vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("rotte aperte", () => {
    it("l'healthcheck risponde senza sessione", async () => {
        const response = await request(app).get("/api/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "ok" });
        expect(getSessionUser).not.toHaveBeenCalled();
    });

    it("il login è raggiungibile senza sessione", async () => {
        // Corpo non valido: basta a dimostrare che la richiesta arriva al router e non a una guardia.
        const response = await request(app).post("/api/auth/login").send({});

        expect(response.status).toBe(400);
    });
});

describe("scritture da un'altra origine", () => {
    /**
     * Montato prima di ogni router: anche il login, perché una pagina di un sottodominio vicino
     * potrebbe altrimenti far entrare il browser dell'utente in un account scelto da lei.
     */
    it("vengono respinte prima di arrivare ai router, login compreso", async () => {
        const login = await request(app).post("/api/auth/login").set("Sec-Fetch-Site", "same-site").send({});
        const restore = await withSession(
            request(app).post("/api/settings/backup/restore/upload").set("Sec-Fetch-Site", "same-site")
        );

        expect(login.status).toBe(403);
        expect(restore.status).toBe(403);
        expect(getSessionUser).not.toHaveBeenCalled();
    });
});

describe("tutto il resto di /api chiede una sessione", () => {
    it.each([
        "/api/reports",
        "/api/customers",
        "/api/collaborators",
        "/api/technicians",
        "/api/devices",
        "/api/issues",
        "/api/interventions",
        "/api/notifications",
        "/api/settings/company",
        "/api/users",
        "/api/rotta-che-non-esiste",
    ])("GET %s senza cookie risponde 401", async (url) => {
        const response = await request(app).get(url);

        expect(response.status).toBe(401);
    });

    it("una sessione scaduta risponde 401", async () => {
        getSessionUser.mockResolvedValue(null);

        const response = await withSession(request(app).get("/api/reports"));

        expect(response.status).toBe(401);
    });
});

describe("password da cambiare e 2FA da configurare", () => {
    it("con la password ancora da cambiare blocca i dati, ma lascia le rotte di autenticazione", async () => {
        getSessionUser.mockResolvedValue({ ...user, mustChangePassword: true });

        const blocked = await withSession(request(app).get("/api/reports"));
        const me = await withSession(request(app).get("/api/auth/me"));

        expect(blocked.status).toBe(403);
        expect(blocked.body.mustChangePassword).toBe(true);
        expect(me.status).toBe(200);
    });

    /**
     * L'admin senza 2FA non deve raggiungere nient'altro che la configurazione: il suo account
     * lancia gli aggiornamenti e ripristina i backup.
     */
    it("con la 2FA da configurare blocca i dati, ma lascia le rotte per configurarla", async () => {
        getSessionUser.mockResolvedValue({ ...user, isAdmin: true, twoFactorSetupRequired: true });
        getTwoFactorStatus.mockResolvedValue({ enabled: false, remainingRecoveryCodes: 0 });

        const blocked = await withSession(request(app).get("/api/settings/update"));
        const status = await withSession(request(app).get("/api/auth/2fa"));

        expect(blocked.status).toBe(403);
        expect(blocked.body.twoFactorSetupRequired).toBe(true);
        expect(status.status).toBe(200);
    });
});

describe("rotte da amministratore", () => {
    it("la gestione utenti è negata a chi non è amministratore", async () => {
        getSessionUser.mockResolvedValue(user);

        const response = await withSession(request(app).get("/api/users"));

        expect(response.status).toBe(403);
        expect(listUsers).not.toHaveBeenCalled();
    });

    it("l'amministratore arriva alla gestione utenti", async () => {
        getSessionUser.mockResolvedValue({ ...user, id: 1, isAdmin: true, twoFactorEnabled: true });
        listUsers.mockResolvedValue([]);

        const response = await withSession(request(app).get("/api/users"));

        expect(response.status).toBe(200);
        expect(listUsers).toHaveBeenCalledOnce();
    });
});

describe("logo caricato dagli utenti", () => {
    /** Un SVG aperto direttamente sarebbe un documento sulla stessa origin dell'app, script compresi. */
    it("esce in sandbox, come allegato e senza cache", async () => {
        const response = await request(app).get("/assets/logo.jpg");

        expect(response.status).toBe(200);
        expect(response.headers["content-security-policy"]).toBe("sandbox");
        expect(response.headers["content-disposition"]).toMatch(/^attachment/);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.headers["content-type"]).toContain("image/svg+xml");
    });
});

describe("configurazione dell'app", () => {
    /** Frontend e backend sono la stessa origin: il CORS resta spento finché CORS_ORIGIN non lo chiede. */
    it("senza CORS_ORIGIN non concede nessuna origin esterna", async () => {
        const response = await request(app).get("/api/health").set("Origin", "https://attaccante.example");

        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    /** `true` farebbe scegliere al chiamante l'IP visto dal limitatore dei login. */
    it("si fida di un solo proxy davanti a sé", () => {
        expect(app.get("trust proxy")).toBe(1);
    });
});
