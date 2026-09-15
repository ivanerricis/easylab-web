import { describe, expect, it, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

vi.mock("../services/authManager", () => ({
    listUsers: vi.fn(),
    createUser: vi.fn(),
    regeneratePassword: vi.fn(),
    adminDisableTwoFactor: vi.fn(),
    assertOwnPassword: vi.fn(),
    setUserActive: vi.fn(),
    deleteUser: vi.fn(),
    listSessionsForUser: vi.fn(),
    revokeSession: vi.fn(),
}));

import { ApiError } from "../services/apiError";
import {
    adminDisableTwoFactor,
    assertOwnPassword,
    createUser,
    deleteUser,
    listSessionsForUser,
    listUsers,
    regeneratePassword,
    revokeSession,
    setUserActive,
} from "../services/authManager";
import usersRouter from "./users";
import { errorHandler } from "../middleware/errorHandler";
import { sessionCookieName } from "../middleware/requireAuth";

// La rotta legge `req.user` (popolato in produzione da `requireAuth`) per il controllo
// "non puoi disabilitare/eliminare te stesso": qui lo si inietta direttamente.
const buildApp = (currentUserId = 1) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        req.user = { id: currentUserId } as Request["user"];
        next();
    });
    app.use("/api/users", usersRouter);
    app.use(errorHandler);
    return app;
};

const user = { id: 2, username: "mario", isAdmin: false, mustChangePassword: true };

describe("users router", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("elenca gli utenti", async () => {
        vi.mocked(listUsers).mockResolvedValue([user] as never);

        const response = await request(buildApp()).get("/api/users");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
    });

    it("crea un utente e risponde 201", async () => {
        vi.mocked(createUser).mockResolvedValue({ user, initialPassword: "abc123" } as never);

        const response = await request(buildApp()).post("/api/users").send({ username: "mario" });

        expect(response.status).toBe(201);
        expect(createUser).toHaveBeenCalledWith("mario");
    });

    it("rifiuta uno username vuoto", async () => {
        const response = await request(buildApp()).post("/api/users").send({ username: "  " });

        expect(response.status).toBe(400);
        expect(createUser).not.toHaveBeenCalled();
    });

    it("rigenera la password di un utente", async () => {
        vi.mocked(regeneratePassword).mockResolvedValue({ initialPassword: "xyz789" } as never);

        const response = await request(buildApp()).post("/api/users/2/regenerate-password");

        expect(response.status).toBe(200);
        expect(regeneratePassword).toHaveBeenCalledWith(2);
    });

    /**
     * Una password nuova in chiaro senza chiedere quella attuale: sul proprio account vorrebbe
     * dire che una sessione admin rubata basta a prendersi l'account e chiudere fuori chi lo
     * possiede.
     */
    it("rifiuta di rigenerare la propria stessa password", async () => {
        const response = await request(buildApp(2)).post("/api/users/2/regenerate-password");

        expect(response.status).toBe(400);
        expect(regeneratePassword).not.toHaveBeenCalled();
    });

    it("disabilita la 2FA di un altro utente senza chiedere password", async () => {
        vi.mocked(adminDisableTwoFactor).mockResolvedValue(user as never);

        const response = await request(buildApp(1)).post("/api/users/2/disable-2fa");

        expect(response.status).toBe(200);
        expect(adminDisableTwoFactor).toHaveBeenCalledWith(2);
        expect(assertOwnPassword).not.toHaveBeenCalled();
    });

    it("sulla propria 2FA pretende la password prima di disattivarla", async () => {
        const response = await request(buildApp(2)).post("/api/users/2/disable-2fa");

        expect(response.status).toBe(400);
        expect(adminDisableTwoFactor).not.toHaveBeenCalled();
    });

    it("sulla propria 2FA, con la password giusta, la verifica e poi la disattiva", async () => {
        vi.mocked(assertOwnPassword).mockResolvedValue(undefined);
        vi.mocked(adminDisableTwoFactor).mockResolvedValue(user as never);

        const response = await request(buildApp(2)).post("/api/users/2/disable-2fa").send({ password: "segreta" });

        expect(response.status).toBe(200);
        expect(assertOwnPassword).toHaveBeenCalledWith(2, "segreta");
        expect(adminDisableTwoFactor).toHaveBeenCalledWith(2);
    });

    it("sulla propria 2FA, con la password sbagliata, non la disattiva", async () => {
        vi.mocked(assertOwnPassword).mockRejectedValue(new ApiError("La password non è corretta", 400));

        const response = await request(buildApp(2)).post("/api/users/2/disable-2fa").send({ password: "sbagliata" });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("La password non è corretta");
        expect(adminDisableTwoFactor).not.toHaveBeenCalled();
    });

    it("disabilita un altro utente", async () => {
        vi.mocked(setUserActive).mockResolvedValue(user as never);

        const response = await request(buildApp(1)).post("/api/users/2/disable");

        expect(response.status).toBe(200);
        expect(setUserActive).toHaveBeenCalledWith(2, false);
    });

    it("rifiuta di disabilitare il proprio stesso account", async () => {
        const response = await request(buildApp(2)).post("/api/users/2/disable");

        expect(response.status).toBe(400);
        expect(setUserActive).not.toHaveBeenCalled();
    });

    it("riabilita un utente", async () => {
        vi.mocked(setUserActive).mockResolvedValue(user as never);

        const response = await request(buildApp()).post("/api/users/2/enable");

        expect(response.status).toBe(200);
        expect(setUserActive).toHaveBeenCalledWith(2, true);
    });

    it("elimina un altro utente e risponde 204", async () => {
        vi.mocked(deleteUser).mockResolvedValue(undefined as never);

        const response = await request(buildApp(1)).delete("/api/users/2");

        expect(response.status).toBe(204);
        expect(deleteUser).toHaveBeenCalledWith(2);
    });

    it("rifiuta di eliminare il proprio stesso account", async () => {
        const response = await request(buildApp(2)).delete("/api/users/2");

        expect(response.status).toBe(400);
        expect(deleteUser).not.toHaveBeenCalled();
    });

    it("elenca le sessioni di un utente senza il cookie di chi chiama", async () => {
        vi.mocked(listSessionsForUser).mockResolvedValue([]);

        const response = await request(buildApp()).get("/api/users/2/sessions");

        expect(response.status).toBe(200);
        expect(listSessionsForUser).toHaveBeenCalledWith(2, undefined);
    });

    it("passa il token della propria sessione per marcare quella corrente", async () => {
        vi.mocked(listSessionsForUser).mockResolvedValue([]);

        const response = await request(buildApp())
            .get("/api/users/2/sessions")
            .set("Cookie", `${sessionCookieName}=abc123`);

        expect(response.status).toBe(200);
        expect(listSessionsForUser).toHaveBeenCalledWith(2, "abc123");
    });

    it("revoca una sessione e risponde 204", async () => {
        vi.mocked(revokeSession).mockResolvedValue(undefined);
        const sessionId = "a".repeat(64);

        const response = await request(buildApp()).delete(`/api/users/2/sessions/${sessionId}`);

        expect(response.status).toBe(204);
        expect(revokeSession).toHaveBeenCalledWith(2, sessionId);
    });

    it("rifiuta un id di sessione che non è uno sha256 esadecimale", async () => {
        const response = await request(buildApp()).delete("/api/users/2/sessions/non-un-hash");

        expect(response.status).toBe(400);
        expect(revokeSession).not.toHaveBeenCalled();
    });
});
