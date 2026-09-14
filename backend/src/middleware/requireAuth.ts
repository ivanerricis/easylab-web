import type { NextFunction, Request, Response } from "express";
import { getSessionUser, type PublicUser } from "../services/authManager";

export const sessionCookieName = "session";

// In produzione l'app è raggiungibile solo dal dominio pubblico servito da Cloudflare
// Tunnel, quindi sempre in HTTPS: il cookie di sessione non deve mai viaggiare in chiaro.
// In sviluppo il frontend gira su http://localhost, dove un cookie `secure` non verrebbe
// inviato affatto, quindi lì resta false. Nessun attributo `domain`: il cookie si limita
// da sé all'host che lo ha emesso, ed è ciò che permette di cambiare dominio senza
// toccare il codice.
export const sessionCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
};

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: PublicUser;
        }
    }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[sessionCookieName] as string | undefined;

    if (!token) {
        res.status(401).json({ message: "Autenticazione richiesta" });
        return;
    }

    const user = await getSessionUser(token);

    if (!user) {
        res.clearCookie(sessionCookieName);
        res.status(401).json({ message: "Sessione scaduta o non valida" });
        return;
    }

    req.user = user;
    next();
};

// Da applicare dopo requireAuth sulle rotte diverse da /api/auth/*, che devono restare
// utilizzabili (login, logout, cambio password) anche quando la password va cambiata.
export const requirePasswordChangeCompleted = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.mustChangePassword) {
        res.status(403).json({ message: "Devi cambiare la password prima di continuare", mustChangePassword: true });
        return;
    }

    next();
};

// Stesso schema del cambio password, e va dopo di esso: le rotte che configurano la 2FA
// stanno in /api/auth/* e restano raggiungibili, tutto il resto aspetta.
export const requireTwoFactorSetupCompleted = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.twoFactorSetupRequired) {
        res.status(403).json({
            message: "Attiva la verifica in due passaggi prima di continuare",
            twoFactorSetupRequired: true,
        });
        return;
    }

    next();
};

// Da applicare dopo requireAuth sulle rotte riservate all'amministratore (il primo utente
// mai registrato nel sistema).
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.isAdmin) {
        res.status(403).json({ message: "Richiesti permessi di amministratore" });
        return;
    }

    next();
};
