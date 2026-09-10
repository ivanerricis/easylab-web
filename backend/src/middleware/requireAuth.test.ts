import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("../services/authManager", () => ({
    getSessionUser: vi.fn(),
}));

import { getSessionUser } from "../services/authManager";
import { requireAdmin, requirePasswordChangeCompleted, requireAuth, sessionCookieName } from "./requireAuth";

const createResponse = () => {
    const res = {
        statusCode: 0,
        body: undefined as unknown,
        cleared: undefined as string | undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
        clearCookie(name: string) {
            this.cleared = name;
            return this;
        },
    };

    return res as unknown as Response & {
        statusCode: number;
        body: { message: string };
        cleared: string | undefined;
    };
};

const createRequest = (token?: string) => ({ cookies: token ? { [sessionCookieName]: token } : {} }) as Request;

describe("requireAuth", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("risponde 401 senza cookie di sessione, senza cercare l'utente", async () => {
        const res = createResponse();
        const next = vi.fn();

        await requireAuth(createRequest(), res, next as NextFunction);

        expect(res.statusCode).toBe(401);
        expect(getSessionUser).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it("risponde 401 e pulisce il cookie con un token non valido", async () => {
        vi.mocked(getSessionUser).mockResolvedValue(null);
        const res = createResponse();
        const next = vi.fn();

        await requireAuth(createRequest("token-scaduto"), res, next as NextFunction);

        expect(res.statusCode).toBe(401);
        expect(res.cleared).toBe(sessionCookieName);
        expect(next).not.toHaveBeenCalled();
    });

    it("popola req.user e passa oltre con un token valido", async () => {
        const user = { id: 1, username: "mario", isAdmin: false, mustChangePassword: false };
        vi.mocked(getSessionUser).mockResolvedValue(user as never);
        const res = createResponse();
        const next = vi.fn();
        const req = createRequest("token-valido");

        await requireAuth(req, res, next as NextFunction);

        expect(req.user).toEqual(user);
        expect(next).toHaveBeenCalledOnce();
        expect(res.statusCode).toBe(0);
    });
});

describe("requirePasswordChangeCompleted", () => {
    it("blocca con 403 quando l'utente deve ancora cambiare password", () => {
        const res = createResponse();
        const next = vi.fn();
        const req = { user: { mustChangePassword: true } } as Request;

        requirePasswordChangeCompleted(req, res, next as NextFunction);

        expect(res.statusCode).toBe(403);
        expect(res.body).toMatchObject({ mustChangePassword: true });
        expect(next).not.toHaveBeenCalled();
    });

    it("lascia passare quando la password è già stata cambiata", () => {
        const res = createResponse();
        const next = vi.fn();
        const req = { user: { mustChangePassword: false } } as Request;

        requirePasswordChangeCompleted(req, res, next as NextFunction);

        expect(next).toHaveBeenCalledOnce();
    });
});

describe("requireAdmin", () => {
    it("risponde 403 a un utente non amministratore", () => {
        const res = createResponse();
        const next = vi.fn();
        const req = { user: { isAdmin: false } } as Request;

        requireAdmin(req, res, next as NextFunction);

        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("lascia passare un amministratore", () => {
        const res = createResponse();
        const next = vi.fn();
        const req = { user: { isAdmin: true } } as Request;

        requireAdmin(req, res, next as NextFunction);

        expect(next).toHaveBeenCalledOnce();
    });
});
