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
    completeTwoFactorLogin,
    getSessionUser,
    getTwoFactorStatus,
    login,
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
