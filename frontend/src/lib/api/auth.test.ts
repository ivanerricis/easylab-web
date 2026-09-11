import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { changeOwnPassword, getMe, login, logout, verifyTwoFactorLogin } from "./auth";
import {
    disableTwoFactor,
    enableTwoFactor,
    getTwoFactorStatus,
    regenerateRecoveryCodes,
    startTwoFactorSetup,
} from "./twoFactor";
import {
    createUser,
    deleteUser,
    disableUser,
    disableUserTwoFactor,
    enableUser,
    listUsers,
    regeneratePassword,
} from "./users";

const user = {
    id: 1,
    username: "mario",
    createdAt: "2026-01-01T00:00:00.000Z",
    mustChangePassword: false,
    active: true,
    isAdmin: false,
    twoFactorEnabled: false,
};

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("login", () => {
    it("riconosce l'accesso completato", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: user });

        await expect(login("mario", "segreta1!")).resolves.toEqual({ status: "authenticated", user });
        expect(post).toHaveBeenCalledWith("/auth/login", { username: "mario", password: "segreta1!" });
    });

    /**
     * Con la 2FA il server risponde 200 anche al primo passo: se il client scambiasse il
     * challenge per un utente, entrerebbe nell'app senza sessione.
     */
    it("riconosce la richiesta del secondo fattore", async () => {
        vi.spyOn(api, "post").mockResolvedValue({ data: { twoFactorRequired: true, challengeId: "abc" } });

        await expect(login("mario", "segreta1!")).resolves.toEqual({
            status: "twoFactorRequired",
            challengeId: "abc",
        });
    });

    it("completa il secondo passo, esce e legge l'utente corrente", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: user });
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: user });
        const put = vi.spyOn(api, "put").mockResolvedValue({ data: undefined });

        await expect(verifyTwoFactorLogin("abc", "123456")).resolves.toEqual(user);
        await logout();
        await expect(getMe()).resolves.toEqual(user);
        await changeOwnPassword({ currentPassword: "a", newPassword: "b" });

        expect(post).toHaveBeenCalledWith("/auth/login/2fa", { challengeId: "abc", code: "123456" });
        expect(post).toHaveBeenCalledWith("/auth/logout");
        expect(get).toHaveBeenCalledWith("/auth/me");
        expect(put).toHaveBeenCalledWith("/auth/password", { currentPassword: "a", newPassword: "b" });
    });
});

describe("gestione del proprio secondo fattore", () => {
    it("usa le rotte /auth/2fa", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: { enabled: true } });
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { recoveryCodes: ["a"] } });
        const del = vi.spyOn(api, "delete").mockResolvedValue({ data: undefined });

        await getTwoFactorStatus();
        await startTwoFactorSetup("pw");
        await expect(enableTwoFactor("123456")).resolves.toEqual({ recoveryCodes: ["a"] });
        await regenerateRecoveryCodes({ password: "pw", code: "123456" });
        await disableTwoFactor({ password: "pw", code: "123456" });

        expect(get).toHaveBeenCalledWith("/auth/2fa");
        expect(post).toHaveBeenCalledWith("/auth/2fa/setup", { password: "pw" });
        expect(post).toHaveBeenCalledWith("/auth/2fa/enable", { code: "123456" });
        expect(post).toHaveBeenCalledWith("/auth/2fa/recovery-codes", { password: "pw", code: "123456" });
        // Una DELETE con corpo: axios lo vuole in `data`, non come secondo argomento.
        expect(del).toHaveBeenCalledWith("/auth/2fa", { data: { password: "pw", code: "123456" } });
    });
});

describe("gestione utenti", () => {
    it("usa le rotte /users", async () => {
        const get = vi.spyOn(api, "get").mockResolvedValue({ data: [user] });
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: { user, generatedPassword: "x" } });
        const del = vi.spyOn(api, "delete").mockResolvedValue({ data: undefined });

        await expect(listUsers()).resolves.toEqual([user]);
        await createUser("luigi");
        await regeneratePassword(2);
        await disableUser(2);
        await enableUser(2);
        await deleteUser(2);

        expect(get).toHaveBeenCalledWith("/users");
        expect(post).toHaveBeenCalledWith("/users", { username: "luigi" });
        expect(post).toHaveBeenCalledWith("/users/2/regenerate-password");
        expect(post).toHaveBeenCalledWith("/users/2/disable");
        expect(post).toHaveBeenCalledWith("/users/2/enable");
        expect(del).toHaveBeenCalledWith("/users/2");
    });

    it("manda la password per togliere la 2FA solo se indicata", async () => {
        const post = vi.spyOn(api, "post").mockResolvedValue({ data: user });

        await disableUserTwoFactor(2);
        await disableUserTwoFactor(1, "mia-password");

        expect(post).toHaveBeenNthCalledWith(1, "/users/2/disable-2fa", undefined);
        expect(post).toHaveBeenNthCalledWith(2, "/users/1/disable-2fa", { password: "mia-password" });
    });
});
