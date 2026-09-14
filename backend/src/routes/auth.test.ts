import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// Il servizio è mockato: la logica del secondo fattore ha già i suoi test senza database
// (`totp.test.ts`, `recoveryCodes.test.ts`, `twoFactorChallenge.test.ts`), mentre qui
// interessa il contorno — chi riceve un cookie e chi no, quali guardie sono in mezzo, e
// quali risposte arrivano al client.
vi.mock("../services/authManager", () => ({
    login: vi.fn(),
    completeTwoFactorLogin: vi.fn(),
    getSessionUser: vi.fn(),
    getTwoFactorStatus: vi.fn(),
    startTwoFactorSetup: vi.fn(),
    confirmTwoFactorSetup: vi.fn(),
    disableTwoFactor: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
    changeOwnPassword: vi.fn(),
    deleteSession: vi.fn(),
}));

import {
    changeOwnPassword,
    completeTwoFactorLogin,
    confirmTwoFactorSetup,
    deleteSession,
    disableTwoFactor,
    getSessionUser,
    getTwoFactorStatus,
    login,
    regenerateRecoveryCodes,
    startTwoFactorSetup,
} from "../services/authManager";
import authRouter from "./auth";
import { errorHandler } from "../middleware/errorHandler";
import { ApiError } from "../services/apiError";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/auth", authRouter);
    app.use(errorHandler);
    return app;
};

const publicUser = {
    id: 1,
    username: "mario",
    createdAt: new Date("2026-01-01").toISOString(),
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: true,
    twoFactorSetupRequired: false,
};

const sessionCookieOf = (response: request.Response) =>
    (response.headers["set-cookie"] as unknown as string[] | undefined)?.find((cookie) =>
        cookie.startsWith("session=")
    );

describe("POST /api/auth/login", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("consegna il cookie di sessione quando la 2FA non è attiva", async () => {
        vi.mocked(login).mockResolvedValue({
            status: "authenticated",
            token: "un-token",
            expiresAt: new Date(),
            user: { ...publicUser, twoFactorEnabled: false },
        });

        const response = await request(buildApp())
            .post("/api/auth/login")
            .send({ username: "mario", password: "segreta1!" });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ username: "mario" });
        expect(sessionCookieOf(response)).toContain("session=un-token");
    });

    // Il cuore della 2FA: se una sessione nascesse già qui, il secondo fattore sarebbe una
    // schermata da saltare invece di una porta chiusa. È l'errore che un giorno si
    // introdurrebbe rifattorizzando, e che nient'altro noterebbe.
    it("non consegna nessun cookie quando manca ancora il secondo fattore", async () => {
        vi.mocked(login).mockResolvedValue({ status: "twoFactorRequired", challengeId: "abc123" });

        const response = await request(buildApp())
            .post("/api/auth/login")
            .send({ username: "mario", password: "segreta1!" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ twoFactorRequired: true, challengeId: "abc123" });
        expect(sessionCookieOf(response)).toBeUndefined();
    });

    it("propaga lo stato e il messaggio dell'errore del servizio", async () => {
        vi.mocked(login).mockRejectedValue(new ApiError("Nome utente o password non validi", 401));

        const response = await request(buildApp())
            .post("/api/auth/login")
            .send({ username: "mario", password: "sbagliata" });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Nome utente o password non validi");
    });
});

describe("POST /api/auth/login/2fa", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("consegna il cookie di sessione quando il codice è giusto", async () => {
        vi.mocked(completeTwoFactorLogin).mockResolvedValue({
            status: "authenticated",
            token: "token-dopo-2fa",
            expiresAt: new Date(),
            user: publicUser,
        });

        const response = await request(buildApp())
            .post("/api/auth/login/2fa")
            .send({ challengeId: "abc123", code: "123456" });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ username: "mario", twoFactorEnabled: true });
        expect(sessionCookieOf(response)).toContain("session=token-dopo-2fa");
    });

    it("risponde 401 senza cookie quando il codice è sbagliato", async () => {
        vi.mocked(completeTwoFactorLogin).mockRejectedValue(new ApiError("Codice non valido", 401));

        const response = await request(buildApp())
            .post("/api/auth/login/2fa")
            .send({ challengeId: "abc123", code: "000000" });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Codice non valido");
        expect(sessionCookieOf(response)).toBeUndefined();
    });

    /**
     * 401 e 410 non sono intercambiabili: sul primo il client lascia riprovare il codice,
     * sul secondo riporta alla password perché non c'è più niente da verificare. È il
     * contratto su cui `LoginPage` decide, e distinguerlo dal testo del messaggio — che è
     * scritto per le persone — sarebbe fragile alla prima riformulazione.
     */
    it("distingue con un 410 il challenge esaurito, che obbliga a ripartire dalla password", async () => {
        vi.mocked(completeTwoFactorLogin).mockRejectedValue(
            new ApiError("Troppi codici errati. Ripeti l'accesso.", 410)
        );

        const response = await request(buildApp())
            .post("/api/auth/login/2fa")
            .send({ challengeId: "abc123", code: "000000" });

        expect(response.status).toBe(410);
        expect(response.body.message).toBe("Troppi codici errati. Ripeti l'accesso.");
    });

    it("rifiuta la richiesta senza challenge prima di arrivare al servizio", async () => {
        const response = await request(buildApp()).post("/api/auth/login/2fa").send({ code: "123456" });

        expect(response.status).toBe(400);
        expect(completeTwoFactorLogin).not.toHaveBeenCalled();
    });
});

describe("rotte di gestione del proprio secondo fattore", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("richiede una sessione", async () => {
        const response = await request(buildApp()).post("/api/auth/2fa/setup").send({ password: "segreta1!" });

        expect(response.status).toBe(401);
        expect(startTwoFactorSetup).not.toHaveBeenCalled();
    });

    /**
     * `requirePasswordChangeCompleted` è montato su `/api` *dopo* questo router, quindi le
     * rotte di autenticazione ne sono esenti per costruzione — giusto per login e cambio
     * password, sbagliato qui. La guardia è ripetuta a mano nel router, e questo test è
     * l'unica cosa che se ne accorgerebbe se sparisse.
     */
    it("non lascia configurare la 2FA finché la password imposta non è stata cambiata", async () => {
        vi.mocked(getSessionUser).mockResolvedValue({ ...publicUser, mustChangePassword: true });

        const response = await request(buildApp())
            .post("/api/auth/2fa/setup")
            .set("Cookie", "session=un-token")
            .send({ password: "segreta1!" });

        expect(response.status).toBe(403);
        expect(startTwoFactorSetup).not.toHaveBeenCalled();
    });

    it("restituisce lo stato a chi ha una sessione valida", async () => {
        vi.mocked(getSessionUser).mockResolvedValue(publicUser);
        vi.mocked(getTwoFactorStatus).mockResolvedValue({ enabled: true, remainingRecoveryCodes: 6 });

        const response = await request(buildApp()).get("/api/auth/2fa").set("Cookie", "session=un-token");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ enabled: true, remainingRecoveryCodes: 6 });
        expect(getTwoFactorStatus).toHaveBeenCalledWith(publicUser.id);
    });

    // Il segreto e il QR escono da `/2fa/setup` e da nessun'altra parte: nessuna rotta di
    // lettura deve poterli restituire, nemmeno all'admin.
    it("consegna QR e segreto solo a chi ha appena dato la propria password", async () => {
        vi.mocked(getSessionUser).mockResolvedValue({ ...publicUser, twoFactorEnabled: false });
        vi.mocked(startTwoFactorSetup).mockResolvedValue({
            secretBase32: "GEZDGNBVGY3TQOJQ",
            otpauthUri: "otpauth://totp/EasyLab:mario?secret=GEZDGNBVGY3TQOJQ&issuer=EasyLab",
            qrDataUrl: "data:image/png;base64,AAAA",
        });

        const response = await request(buildApp())
            .post("/api/auth/2fa/setup")
            .set("Cookie", "session=un-token")
            .send({ password: "segreta1!" });

        expect(response.status).toBe(200);
        expect(response.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
        expect(startTwoFactorSetup).toHaveBeenCalledWith(publicUser.id, "segreta1!");
    });

    it("non accetta la configurazione senza password", async () => {
        vi.mocked(getSessionUser).mockResolvedValue({ ...publicUser, twoFactorEnabled: false });

        const response = await request(buildApp())
            .post("/api/auth/2fa/setup")
            .set("Cookie", "session=un-token")
            .send({});

        expect(response.status).toBe(400);
        expect(startTwoFactorSetup).not.toHaveBeenCalled();
    });
});

describe("POST /api/auth/login/2fa: risultato inatteso dal servizio", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /** Irraggiungibile oggi, ma se il servizio cambiasse non deve nascere un cookie vuoto. */
    it("risponde 401 senza cookie se il servizio non autentica", async () => {
        vi.mocked(completeTwoFactorLogin).mockResolvedValue({ status: "twoFactorRequired", challengeId: "altro" });

        const response = await request(buildApp())
            .post("/api/auth/login/2fa")
            .send({ challengeId: "abc123", code: "123456" });

        expect(response.status).toBe(401);
        expect(sessionCookieOf(response)).toBeUndefined();
    });
});

describe("POST /api/auth/logout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("cancella la sessione del cookie e svuota il cookie", async () => {
        vi.mocked(getSessionUser).mockResolvedValue(publicUser);

        const response = await request(buildApp()).post("/api/auth/logout").set("Cookie", "session=un-token");

        expect(response.status).toBe(204);
        expect(deleteSession).toHaveBeenCalledWith("un-token");
        expect(sessionCookieOf(response)).toMatch(/^session=;/);
    });

    it("senza sessione risponde 401 e non cancella niente", async () => {
        const response = await request(buildApp()).post("/api/auth/logout");

        expect(response.status).toBe(401);
        expect(deleteSession).not.toHaveBeenCalled();
    });
});

describe("GET /api/auth/me", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("restituisce l'utente della sessione", async () => {
        vi.mocked(getSessionUser).mockResolvedValue(publicUser);

        const response = await request(buildApp()).get("/api/auth/me").set("Cookie", "session=un-token");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(publicUser);
    });

    it("con una sessione scaduta risponde 401 e svuota il cookie", async () => {
        vi.mocked(getSessionUser).mockResolvedValue(null);

        const response = await request(buildApp()).get("/api/auth/me").set("Cookie", "session=scaduto");

        expect(response.status).toBe(401);
        expect(sessionCookieOf(response)).toMatch(/^session=;/);
    });
});

describe("PUT /api/auth/password", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /** È la rotta che sblocca il primo accesso: deve restare raggiungibile a chi deve cambiare password. */
    it("resta raggiungibile a chi ha la password da cambiare, e passa la sessione corrente al servizio", async () => {
        vi.mocked(getSessionUser).mockResolvedValue({ ...publicUser, mustChangePassword: true });

        const response = await request(buildApp())
            .put("/api/auth/password")
            .set("Cookie", "session=un-token")
            .send({ currentPassword: "vecchia", newPassword: "Nuova-password-1!" });

        expect(response.status).toBe(204);
        expect(changeOwnPassword).toHaveBeenCalledWith(publicUser.id, "vecchia", "Nuova-password-1!", "un-token");
    });

    it("rifiuta una nuova password fuori dalle regole prima di arrivare al servizio", async () => {
        vi.mocked(getSessionUser).mockResolvedValue(publicUser);

        const response = await request(buildApp())
            .put("/api/auth/password")
            .set("Cookie", "session=un-token")
            .send({ currentPassword: "vecchia", newPassword: "corta" });

        expect(response.status).toBe(400);
        expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("propaga l'errore del servizio sulla password attuale sbagliata", async () => {
        vi.mocked(getSessionUser).mockResolvedValue(publicUser);
        vi.mocked(changeOwnPassword).mockRejectedValue(new ApiError("La password attuale non è corretta", 400));

        const response = await request(buildApp())
            .put("/api/auth/password")
            .set("Cookie", "session=un-token")
            .send({ currentPassword: "sbagliata", newPassword: "Nuova-password-1!" });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("La password attuale non è corretta");
    });

    it("senza sessione risponde 401", async () => {
        const response = await request(buildApp())
            .put("/api/auth/password")
            .send({ currentPassword: "vecchia", newPassword: "Nuova-password-1!" });

        expect(response.status).toBe(401);
        expect(changeOwnPassword).not.toHaveBeenCalled();
    });
});

describe("attivazione, disattivazione e codici di recupero", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSessionUser).mockResolvedValue(publicUser);
    });

    /**
     * L'admin a cui la 2FA è imposta passa proprio da qui per configurarla: se queste rotte
     * avessero anche `requireTwoFactorSetupCompleted` resterebbe chiuso fuori per sempre.
     */
    it("lascia confermare la 2FA all'admin a cui è imposta, passando la sessione corrente", async () => {
        vi.mocked(getSessionUser).mockResolvedValue({
            ...publicUser,
            isAdmin: true,
            twoFactorEnabled: false,
            twoFactorSetupRequired: true,
        });
        vi.mocked(confirmTwoFactorSetup).mockResolvedValue({ recoveryCodes: ["ABCD2345"] });

        const response = await request(buildApp())
            .post("/api/auth/2fa/enable")
            .set("Cookie", "session=un-token")
            .send({ code: "123456" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ recoveryCodes: ["ABCD2345"] });
        expect(confirmTwoFactorSetup).toHaveBeenCalledWith(publicUser.id, "123456", "un-token");
    });

    it("la conferma senza codice non arriva al servizio", async () => {
        const response = await request(buildApp())
            .post("/api/auth/2fa/enable")
            .set("Cookie", "session=un-token")
            .send({ code: "   " });

        expect(response.status).toBe(400);
        expect(confirmTwoFactorSetup).not.toHaveBeenCalled();
    });

    it("la disattivazione chiede password e codice, e risponde 204", async () => {
        const response = await request(buildApp())
            .delete("/api/auth/2fa")
            .set("Cookie", "session=un-token")
            .send({ password: "segreta1!", code: "123456" });

        expect(response.status).toBe(204);
        expect(disableTwoFactor).toHaveBeenCalledWith(publicUser.id, "segreta1!", "123456");
    });

    it("la disattivazione con la sola password non arriva al servizio", async () => {
        const response = await request(buildApp())
            .delete("/api/auth/2fa")
            .set("Cookie", "session=un-token")
            .send({ password: "segreta1!" });

        expect(response.status).toBe(400);
        expect(disableTwoFactor).not.toHaveBeenCalled();
    });

    it("rigenera i codici di recupero con password e codice", async () => {
        vi.mocked(regenerateRecoveryCodes).mockResolvedValue({ recoveryCodes: ["ZXCV2345", "QWER6789"] });

        const response = await request(buildApp())
            .post("/api/auth/2fa/recovery-codes")
            .set("Cookie", "session=un-token")
            .send({ password: "segreta1!", code: "123456" });

        expect(response.status).toBe(200);
        expect(response.body.recoveryCodes).toHaveLength(2);
        expect(regenerateRecoveryCodes).toHaveBeenCalledWith(publicUser.id, "segreta1!", "123456");
    });

    it("non accetta campi in più nel corpo", async () => {
        const response = await request(buildApp())
            .post("/api/auth/2fa/recovery-codes")
            .set("Cookie", "session=un-token")
            .send({ password: "segreta1!", code: "123456", userId: 1 });

        expect(response.status).toBe(400);
        expect(regenerateRecoveryCodes).not.toHaveBeenCalled();
    });

    it("chi deve ancora cambiare password non può disattivare la 2FA", async () => {
        vi.mocked(getSessionUser).mockResolvedValue({ ...publicUser, mustChangePassword: true });

        const response = await request(buildApp())
            .delete("/api/auth/2fa")
            .set("Cookie", "session=un-token")
            .send({ password: "segreta1!", code: "123456" });

        expect(response.status).toBe(403);
        expect(disableTwoFactor).not.toHaveBeenCalled();
    });
});
