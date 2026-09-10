import { describe, expect, it, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

vi.mock("../services/authManager", () => ({
    listUsers: vi.fn(),
    createUser: vi.fn(),
    regeneratePassword: vi.fn(),
    adminDisableTwoFactor: vi.fn(),
    setUserActive: vi.fn(),
    deleteUser: vi.fn(),
}));

import {
    adminDisableTwoFactor,
    createUser,
    deleteUser,
    listUsers,
    regeneratePassword,
    setUserActive,
} from "../services/authManager";
import usersRouter from "./users";
import { errorHandler } from "../middleware/errorHandler";

// La rotta legge `req.user` (popolato in produzione da `requireAuth`) per il controllo
// "non puoi disabilitare/eliminare te stesso": qui lo si inietta direttamente.
const buildApp = (currentUserId = 1) => {
    const app = express();
    app.use(express.json());
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

    it("disabilita la 2FA di un utente da amministratore", async () => {
        vi.mocked(adminDisableTwoFactor).mockResolvedValue(user as never);

        const response = await request(buildApp()).post("/api/users/2/disable-2fa");

        expect(response.status).toBe(200);
        expect(adminDisableTwoFactor).toHaveBeenCalledWith(2);
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
});
