import { Router } from "express";
import { z } from "zod";
import {
    changeOwnPassword,
    completeTwoFactorLogin,
    confirmTwoFactorSetup,
    deleteSession,
    disableTwoFactor,
    getTwoFactorStatus,
    login,
    regenerateRecoveryCodes,
    startTwoFactorSetup,
} from "../services/authManager";
import {
    requireAuth,
    requirePasswordChangeCompleted,
    sessionCookieName,
    sessionCookieOptions,
} from "../middleware/requireAuth";
import { getClientIp } from "../middleware/clientIp";
import { isPasswordCompliant, passwordRequirementsMessage } from "../services/passwordPolicy";
import { validate } from "./validation";

const authRouter = Router();

const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

const loginBodySchema = z
    .object({
        username: z.string().trim().min(1).max(50),
        password: z.string().min(1).max(512),
    })
    .strict();

const passwordBodySchema = z
    .object({
        currentPassword: z.string().min(1).max(512),
        newPassword: z.string().max(512).refine(isPasswordCompliant, { message: passwordRequirementsMessage }),
    })
    .strict();

/**
 * Un codice a sei cifre oppure uno di recupero: quale dei due lo decide il formato, dentro
 * `authManager`. Qui basta un tetto alla lunghezza — vincolare la forma significherebbe
 * ripetere in due punti una regola che cambierebbe insieme, e rispondere 400 invece di 401
 * a un codice sbagliato racconterebbe più di quanto serve a chi sta provando.
 */
const secondFactorCodeSchema = z.string().trim().min(1).max(64);

const twoFactorLoginBodySchema = z
    .object({
        challengeId: z.string().trim().min(1).max(128),
        code: secondFactorCodeSchema,
    })
    .strict();

const twoFactorSetupBodySchema = z.object({ password: z.string().min(1).max(512) }).strict();

const twoFactorCodeBodySchema = z.object({ code: secondFactorCodeSchema }).strict();

const twoFactorPasswordAndCodeBodySchema = z
    .object({
        password: z.string().min(1).max(512),
        code: secondFactorCodeSchema,
    })
    .strict();

/**
 * Le rotte che gestiscono il *proprio* secondo fattore. `requirePasswordChangeCompleted` va
 * ripetuto qui a mano: è applicato su `/api` dopo questo router, che quindi ne sarebbe
 * esente — giusto per login e cambio password, che devono restare raggiungibili, sbagliato
 * per queste, dove non ha senso configurare la 2FA prima di aver cambiato la password
 * imposta al primo accesso.
 */
const twoFactorGuards = [requireAuth, requirePasswordChangeCompleted] as const;

authRouter.post("/login", validate({ body: loginBodySchema }), async (req, res) => {
    const { username, password } = req.body as { username: string; password: string };
    const result = await login(username, password, getClientIp(req));

    if (result.status === "twoFactorRequired") {
        // Nessun cookie: finché il secondo fattore manca non esiste una sessione. Il
        // challenge torna nel corpo proprio per questo — non deve essere rimandato indietro
        // dal browser su ogni richiesta come farebbe un cookie.
        res.json({ twoFactorRequired: true, challengeId: result.challengeId });
        return;
    }

    res.cookie(sessionCookieName, result.token, { ...sessionCookieOptions, maxAge: sessionMaxAgeMs });
    res.json(result.user);
});

authRouter.post("/login/2fa", validate({ body: twoFactorLoginBodySchema }), async (req, res) => {
    const { challengeId, code } = req.body as { challengeId: string; code: string };
    const result = await completeTwoFactorLogin(challengeId, code, getClientIp(req));

    if (result.status !== "authenticated") {
        // Irraggiungibile: `completeTwoFactorLogin` o autentica o solleva. Il ramo esiste
        // perché il tipo di ritorno è condiviso con il primo passo del login.
        res.status(401).json({ message: "Accesso non riuscito" });
        return;
    }

    res.cookie(sessionCookieName, result.token, { ...sessionCookieOptions, maxAge: sessionMaxAgeMs });
    res.json(result.user);
});

authRouter.post("/logout", requireAuth, async (req, res) => {
    const token = req.cookies?.[sessionCookieName] as string | undefined;
    if (token) {
        await deleteSession(token);
    }
    res.clearCookie(sessionCookieName, sessionCookieOptions);
    res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
    res.json(req.user);
});

authRouter.put("/password", requireAuth, validate({ body: passwordBodySchema }), async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const currentToken = req.cookies?.[sessionCookieName] as string;

    await changeOwnPassword(req.user!.id, currentPassword, newPassword, currentToken);
    res.status(204).send();
});

authRouter.get("/2fa", ...twoFactorGuards, async (req, res) => {
    res.json(await getTwoFactorStatus(req.user!.id));
});

authRouter.post("/2fa/setup", ...twoFactorGuards, validate({ body: twoFactorSetupBodySchema }), async (req, res) => {
    const { password } = req.body as { password: string };

    res.json(await startTwoFactorSetup(req.user!.id, password));
});

authRouter.post("/2fa/enable", ...twoFactorGuards, validate({ body: twoFactorCodeBodySchema }), async (req, res) => {
    const { code } = req.body as { code: string };
    const currentToken = req.cookies?.[sessionCookieName] as string;

    // I codici di recupero passano di qui una volta sola: non sono più recuperabili dopo,
    // perché in tabella ne resta solo lo sha256.
    res.json(await confirmTwoFactorSetup(req.user!.id, code, currentToken));
});

authRouter.delete(
    "/2fa",
    ...twoFactorGuards,
    validate({ body: twoFactorPasswordAndCodeBodySchema }),
    async (req, res) => {
        const { password, code } = req.body as { password: string; code: string };

        await disableTwoFactor(req.user!.id, password, code);
        res.status(204).send();
    }
);

authRouter.post(
    "/2fa/recovery-codes",
    ...twoFactorGuards,
    validate({ body: twoFactorPasswordAndCodeBodySchema }),
    async (req, res) => {
        const { password, code } = req.body as { password: string; code: string };

        res.json(await regenerateRecoveryCodes(req.user!.id, password, code));
    }
);

export default authRouter;
