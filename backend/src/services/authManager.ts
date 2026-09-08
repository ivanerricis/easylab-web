import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { and, asc, eq, lt, ne } from "drizzle-orm";
import { db } from "../db";
import { sessionTable, userTable } from "../db/schema";
import {
    consumeRecoveryCode,
    countUnusedRecoveryCodes,
    deleteRecoveryCodes,
    replaceRecoveryCodes,
} from "../db/queries/recoveryCode";
import { isLoginRateLimited, registerFailedLogin, registerSuccessfulLogin } from "./loginRateLimit";
import { generateCompliantPassword } from "./passwordPolicy";
import { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } from "./recoveryCodes";
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from "./totp";
import {
    createTwoFactorChallenge,
    deleteTwoFactorChallenge,
    getTwoFactorChallengeUserId,
    registerFailedTwoFactorAttempt,
} from "./twoFactorChallenge";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import { getCompanySettings } from "./companyManager";
import { recordNotification } from "./notificationManager";
import { ApiError } from "./apiError";

const dataDir = path.join(process.cwd(), "data");
const initialAdminPasswordFilePath = path.join(dataDir, "initial-admin-password.txt");

const scryptKeyLength = 64;
const sessionTokenBytes = 32;
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const sessionCleanupIntervalMs = 60 * 60 * 1000;

export class AuthManagerError extends ApiError {}

export type PublicUser = {
    id: number;
    username: string;
    createdAt: string;
    mustChangePassword: boolean;
    active: boolean;
    isAdmin: boolean;
    /** Solo se la 2FA è attiva: il segreto non esce mai da qui, nemmeno verso l'admin. */
    twoFactorEnabled: boolean;
};

type UserRow = typeof userTable.$inferSelect;

const hashPassword = (password: string): Promise<string> =>
    new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString("hex");
        crypto.scrypt(password, salt, scryptKeyLength, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
    });

const verifyPassword = (password: string, storedHash: string): Promise<boolean> =>
    new Promise((resolve, reject) => {
        const [salt, hashHex] = storedHash.split(":");
        if (!salt || !hashHex) {
            resolve(false);
            return;
        }

        crypto.scrypt(password, salt, scryptKeyLength, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }
            const expected = Buffer.from(hashHex, "hex");
            resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
        });
    });

const generateSessionToken = () => crypto.randomBytes(sessionTokenBytes).toString("hex");

/**
 * Il cookie contiene il token in chiaro, la tabella solo il suo sha256: chi legge il
 * database - per esempio da un archivio di backup - non ottiene credenziali riutilizzabili.
 * Basta un hash semplice, senza salt né costo di calcolo: il token è già 256 bit casuali,
 * quindi non c'è nulla da indovinare a forza bruta come per una password scelta da una
 * persona, e la ricerca deve restare una lookup su indice a ogni richiesta.
 */
const hashSessionToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

// Hash "esca" usato quando lo username non esiste, per far girare comunque scrypt e non
// rivelare quali username esistono tramite il tempo di risposta del login.
let cachedDummyPasswordHash: Promise<string> | null = null;
const getDummyPasswordHash = (): Promise<string> => {
    if (!cachedDummyPasswordHash) {
        cachedDummyPasswordHash = hashPassword(crypto.randomBytes(32).toString("hex"));
    }
    return cachedDummyPasswordHash;
};

const toPublicUser = (
    user: {
        id: number;
        username: string;
        created_at: Date;
        mustChangePassword: boolean;
        active: boolean;
        totpConfirmedAt: Date | null;
    },
    isAdmin: boolean
): PublicUser => ({
    id: user.id,
    username: user.username,
    createdAt: user.created_at.toISOString(),
    mustChangePassword: user.mustChangePassword,
    active: user.active,
    isAdmin,
    twoFactorEnabled: user.totpConfirmedAt !== null,
});

// L'admin è semplicemente il primo account mai registrato (id più basso): non esiste
// un campo "ruolo" separato da mantenere sincronizzato.
const getAdminUserId = async (): Promise<number | null> => {
    const rows = await db.select({ id: userTable.id }).from(userTable).orderBy(asc(userTable.id)).limit(1);
    return rows[0]?.id ?? null;
};

export const ensureDefaultAdmin = async (): Promise<void> => {
    const existing = await db.select({ id: userTable.id }).from(userTable).limit(1);
    if (existing.length > 0) {
        return;
    }

    const password = generateCompliantPassword();
    const passwordHash = await hashPassword(password);
    await db.insert(userTable).values({ username: "admin", passwordHash, mustChangePassword: true });

    console.log(
        [
            "============================================================",
            "Utente amministratore creato automaticamente al primo avvio:",
            "  nome utente: admin",
            `  password:    ${password}`,
            "Questa password non verrà mostrata di nuovo: cambiala dopo il primo accesso.",
            "============================================================",
        ].join("\n")
    );

    try {
        await fs.promises.mkdir(dataDir, { recursive: true });
        await fs.promises.writeFile(initialAdminPasswordFilePath, `username: admin\npassword: ${password}\n`, {
            encoding: "utf-8",
            mode: 0o600,
        });
    } catch (error) {
        console.error("Impossibile scrivere il file con la password admin iniziale:", error);
    }
};

const assertLoginRateLimit = (ip: string): void => {
    if (isLoginRateLimited(ip)) {
        throw new AuthManagerError("Troppi tentativi di accesso falliti. Riprova più tardi.", 429);
    }
};

export type LoginResult =
    | { status: "twoFactorRequired"; challengeId: string }
    | { status: "authenticated"; token: string; expiresAt: Date; user: PublicUser };

/**
 * L'unico punto che scrive in `sessionTable`: i due passi del login ci arrivano da strade
 * diverse ma devono produrre esattamente la stessa sessione, cookie compreso.
 */
const createSessionForUser = async (user: UserRow): Promise<LoginResult> => {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + sessionDurationMs);
    await db.insert(sessionTable).values({ tokenHash: hashSessionToken(token), userId: user.id, expiresAt });

    const adminId = await getAdminUserId();
    return { status: "authenticated", token, expiresAt, user: toPublicUser(user, user.id === adminId) };
};

export const login = async (username: string, password: string, ip: string): Promise<LoginResult> => {
    assertLoginRateLimit(ip);

    const invalidCredentialsError = new AuthManagerError("Nome utente o password non validi", 401);
    const rows = await db.select().from(userTable).where(eq(userTable.username, username)).limit(1);
    const user = rows[0];

    // Verifica sempre una password (reale o esca) così il tempo di risposta non rivela
    // se lo username esiste.
    const isPasswordValid = await verifyPassword(password, user ? user.passwordHash : await getDummyPasswordHash());

    if (!user || !isPasswordValid) {
        registerFailedLogin(ip);
        throw invalidCredentialsError;
    }

    registerSuccessfulLogin(ip);

    if (!user.active) {
        throw new AuthManagerError("Questo account è stato disabilitato. Contatta un amministratore.", 403);
    }

    // Il secondo fattore si scopre solo adesso, a password già verificata: annunciarlo prima
    // direbbe a un estraneo quali account sono protetti e quali no.
    if (isTwoFactorActive(user)) {
        // Il segreto va letto qui e non al secondo passo: se è illeggibile (ripristino su una
        // macchina con `data/secret.key` diversa) `readTotpSecret` azzera la 2FA e si entra
        // con la sola password, invece di restare chiusi fuori senza spiegazione.
        const secret = await readTotpSecret(user);

        if (secret) {
            return { status: "twoFactorRequired", challengeId: createTwoFactorChallenge(user.id) };
        }

        // `readTotpSecret` ha appena azzerato la 2FA in tabella, ma la riga che abbiamo in
        // mano è di un istante prima: senza questa copia corretta la risposta direbbe al
        // client che la 2FA è ancora attiva, e l'interfaccia mostrerebbe uno stato che non
        // esiste più finché qualcuno non ricarica la pagina.
        return createSessionForUser({ ...user, totpConfirmedAt: null });
    }

    return createSessionForUser(user);
};

export const getSessionUser = async (token: string): Promise<PublicUser | null> => {
    const tokenHash = hashSessionToken(token);
    const rows = await db
        .select({
            expiresAt: sessionTable.expiresAt,
            id: userTable.id,
            username: userTable.username,
            created_at: userTable.created_at,
            mustChangePassword: userTable.mustChangePassword,
            active: userTable.active,
            totpConfirmedAt: userTable.totpConfirmedAt,
        })
        .from(sessionTable)
        .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
        .where(eq(sessionTable.tokenHash, tokenHash))
        .limit(1);

    const row = rows[0];
    if (!row) {
        return null;
    }

    if (row.expiresAt.getTime() <= Date.now() || !row.active) {
        await db.delete(sessionTable).where(eq(sessionTable.tokenHash, tokenHash));
        return null;
    }

    const adminId = await getAdminUserId();
    return toPublicUser(row, row.id === adminId);
};

export const deleteSession = (token: string) =>
    db.delete(sessionTable).where(eq(sessionTable.tokenHash, hashSessionToken(token)));

/**
 * `getSessionUser` cancella una sessione scaduta solo se qualcuno presenta proprio quel
 * token: le sessioni di chi chiude il browser e non torna più resterebbero in tabella
 * per sempre. Questa passa periodica le rimuove comunque.
 */
export const deleteExpiredSessions = async () => {
    const deleted = await db.delete(sessionTable).where(lt(sessionTable.expiresAt, new Date())).returning({
        tokenHash: sessionTable.tokenHash,
    });

    return deleted.length;
};

let sessionCleanupTimer: NodeJS.Timeout | null = null;

const runSessionCleanup = async () => {
    try {
        const removed = await deleteExpiredSessions();
        if (removed > 0) {
            console.log(`Sessioni scadute rimosse: ${removed}`);
        }
    } catch (error) {
        console.error("Errore pulizia sessioni scadute:", error);
    }
};

export const startSessionCleanupScheduler = () => {
    if (sessionCleanupTimer) {
        return;
    }

    void runSessionCleanup();

    sessionCleanupTimer = setInterval(() => {
        void runSessionCleanup();
    }, sessionCleanupIntervalMs);

    // Come lo scheduler dei backup: non deve tenere vivo il processo allo spegnimento.
    sessionCleanupTimer.unref();
};

export const stopSessionCleanupScheduler = () => {
    if (!sessionCleanupTimer) {
        return;
    }

    clearInterval(sessionCleanupTimer);
    sessionCleanupTimer = null;
};

export const deleteAllSessionsForUser = (userId: number) =>
    db.delete(sessionTable).where(eq(sessionTable.userId, userId));

const deleteOtherSessionsForUser = (userId: number, currentToken: string) =>
    db
        .delete(sessionTable)
        .where(and(eq(sessionTable.userId, userId), ne(sessionTable.tokenHash, hashSessionToken(currentToken))));

export const listUsers = async (): Promise<PublicUser[]> => {
    const [rows, adminId] = await Promise.all([
        db.select().from(userTable).orderBy(userTable.username),
        getAdminUserId(),
    ]);
    return rows.map((row) => toPublicUser(row, row.id === adminId));
};

export const createUser = async (username: string) => {
    const password = generateCompliantPassword();
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(userTable).values({ username, passwordHash, mustChangePassword: true }).returning();

    const adminId = await getAdminUserId();
    return { user: toPublicUser(user, user.id === adminId), generatedPassword: password };
};

export const regeneratePassword = async (userId: number) => {
    const rows = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
    const user = rows[0];
    if (!user) {
        throw new AuthManagerError("Utente non trovato", 404);
    }

    const password = generateCompliantPassword();
    const passwordHash = await hashPassword(password);
    await db.update(userTable).set({ passwordHash, mustChangePassword: true }).where(eq(userTable.id, userId));
    // La vecchia password smette di funzionare: chiunque fosse loggato con quell'account
    // (incluso un eventuale ladro di sessione) deve rifare il login con quella nuova.
    await deleteAllSessionsForUser(userId);

    const adminId = await getAdminUserId();
    return {
        user: { ...toPublicUser(user, user.id === adminId), mustChangePassword: true },
        generatedPassword: password,
    };
};

export const setUserActive = async (userId: number, active: boolean): Promise<PublicUser> => {
    const rows = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
    const user = rows[0];
    if (!user) {
        throw new AuthManagerError("Utente non trovato", 404);
    }

    const [updated] = await db.update(userTable).set({ active }).where(eq(userTable.id, userId)).returning();

    if (!active) {
        // Disattivare l'account deve invalidare subito eventuali sessioni già aperte.
        await deleteAllSessionsForUser(userId);
    }

    const adminId = await getAdminUserId();
    return toPublicUser(updated, updated.id === adminId);
};

export const deleteUser = async (userId: number): Promise<void> => {
    const rows = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, userId)).limit(1);
    if (rows.length === 0) {
        throw new AuthManagerError("Utente non trovato", 404);
    }

    // Eventuali FK verso questa tabella senza cascade fanno fallire la query con un
    // vincolo di integrità: l'errore viene tradotto in un messaggio leggibile dal
    // middleware globale, invitando l'admin a disabilitare l'account invece di eliminarlo.
    await db.delete(userTable).where(eq(userTable.id, userId));
};

export const changeOwnPassword = async (
    userId: number,
    currentPassword: string,
    newPassword: string,
    currentSessionToken: string
): Promise<void> => {
    const rows = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
    const user = rows[0];
    if (!user) {
        throw new AuthManagerError("Utente non trovato", 404);
    }

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new AuthManagerError("La password attuale non è corretta", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(userTable).set({ passwordHash, mustChangePassword: false }).where(eq(userTable.id, userId));
    // Disconnette tutte le altre sessioni (es. un token rubato), mantenendo attiva solo quella corrente.
    await deleteOtherSessionsForUser(userId, currentSessionToken);
};

/* -------------------------------------------------------------------------------------
 * Autenticazione a due fattori (TOTP)
 *
 * La logica di calcolo sta nei moduli senza database — `totp.ts`, `recoveryCodes.ts`,
 * `twoFactorChallenge.ts` — e qui si limita a incontrare le righe della tabella `user`.
 * ---------------------------------------------------------------------------------- */

const findUserById = async (userId: number): Promise<UserRow | undefined> => {
    const rows = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);
    return rows[0];
};

const requireUserById = async (userId: number): Promise<UserRow> => {
    const user = await findUserById(userId);

    if (!user) {
        throw new AuthManagerError("Utente non trovato", 404);
    }

    return user;
};

/** La 2FA conta come attiva solo a segreto confermato: uno generato e mai usato non vale. */
const isTwoFactorActive = (user: Pick<UserRow, "totpConfirmedAt">): boolean => user.totpConfirmedAt !== null;

const clearTwoFactor = async (userId: number): Promise<void> => {
    await db
        .update(userTable)
        .set({ totpSecret: null, totpConfirmedAt: null, totpLastStep: null })
        .where(eq(userTable.id, userId));
    await deleteRecoveryCodes(userId);
};

/**
 * Il segreto in chiaro, oppure null se non c'è o non è più leggibile.
 *
 * Il caso che conta è il secondo. `data/secret.key` è escluso dai backup di proposito
 * (`backupFiles.ts`), ma i segreti cifrati stanno nel dump: ripristinato su una macchina
 * con una chiave diversa, nessuno di essi si decifra più. Trattarlo come un errore
 * lascerebbe fuori dall'app chiunque avesse la 2FA attiva — e se è l'admin, non resta
 * nessuno che possa sbloccarlo. Quindi la 2FA viene azzerata e l'evento annunciato, la
 * stessa scelta già fatta per la password del NAS in `backupState.ts`.
 */
const readTotpSecret = async (user: UserRow): Promise<string | null> => {
    if (!user.totpSecret) {
        return null;
    }

    try {
        return await decryptSecret(user.totpSecret);
    } catch {
        await clearTwoFactor(user.id);
        console.error(`Segreto TOTP non decifrabile per l'utente ${user.id}: 2FA azzerata.`);

        await recordNotification({
            dedupeKey: `two-factor-secret-unreadable:${user.id}`,
            severity: "warning",
            title: "Autenticazione a due fattori disattivata",
            message:
                `Il secondo fattore di "${user.username}" non è leggibile con la chiave presente in ` +
                "data/secret.key: succede dopo un ripristino su una macchina diversa, perché la chiave " +
                "non finisce nei backup. È stato disattivato per non lasciare l'account irraggiungibile: " +
                "va riattivato dalle impostazioni.",
            link: "/settings?section=security",
        });

        return null;
    }
};

type SecondFactorResult = { valid: false } | { valid: true; usedRecoveryCode: boolean };

/**
 * Verifica il codice del secondo passo, che sia un TOTP o un codice di recupero. Il formato
 * decide da solo quale dei due: otto caratteri dell'alfabeto dei codici di recupero contro
 * sei cifre, quindi nessuna ambiguità e nessuna scelta da chiedere a chi sta entrando.
 */
const verifySecondFactor = async (user: UserRow, code: string): Promise<SecondFactorResult> => {
    const trimmedCode = code.trim();

    if (looksLikeRecoveryCode(trimmedCode)) {
        const consumed = await consumeRecoveryCode(user.id, hashRecoveryCode(trimmedCode));
        return consumed ? { valid: true, usedRecoveryCode: true } : { valid: false };
    }

    const secret = await readTotpSecret(user);

    if (!secret) {
        return { valid: false };
    }

    const result = verifyTotp(secret, trimmedCode, { lastStep: user.totpLastStep });

    if (!result.valid) {
        return { valid: false };
    }

    // Salvato subito: è questo a rendere il codice monouso dentro i suoi trenta secondi.
    await db.update(userTable).set({ totpLastStep: result.step }).where(eq(userTable.id, user.id));

    return { valid: true, usedRecoveryCode: false };
};

export const completeTwoFactorLogin = async (challengeId: string, code: string, ip: string): Promise<LoginResult> => {
    assertLoginRateLimit(ip);

    // 410 e non 401: 401 è "questo codice è sbagliato, riprova", 410 è "non c'è più niente
    // da verificare, ricomincia dalla password". Il client deve poter distinguere i due casi
    // senza leggere il testo del messaggio, che è scritto per le persone e cambierà.
    const expiredChallengeError = new AuthManagerError("Sessione di accesso scaduta. Ripeti l'accesso.", 410);
    const userId = getTwoFactorChallengeUserId(challengeId);

    if (userId === null) {
        throw expiredChallengeError;
    }

    const user = await findUserById(userId);

    // L'account può essere cambiato nei minuti in cui il challenge è rimasto aperto:
    // disabilitato da un admin, oppure con la 2FA appena tolta da un'altra sessione.
    if (!user || !user.active || !isTwoFactorActive(user)) {
        deleteTwoFactorChallenge(challengeId);
        throw expiredChallengeError;
    }

    const result = await verifySecondFactor(user, code);

    if (!result.valid) {
        // Due limiti insieme: i tentativi su questo challenge e quelli complessivi dell'IP.
        // Un milione di combinazioni si esaurisce in fretta, se si può provare all'infinito.
        registerFailedLogin(ip);
        const challengeStillOpen = registerFailedTwoFactorAttempt(challengeId);

        throw challengeStillOpen
            ? new AuthManagerError("Codice non valido", 401)
            : new AuthManagerError("Troppi codici errati. Ripeti l'accesso.", 410);
    }

    deleteTwoFactorChallenge(challengeId);
    registerSuccessfulLogin(ip);

    if (result.usedRecoveryCode) {
        // Il registro delle azioni non può attribuire questa richiesta, che arriva senza
        // sessione: l'unica traccia di "qualcuno è entrato senza il telefono" è questa.
        const remaining = await countUnusedRecoveryCodes(user.id);

        await recordNotification({
            dedupeKey: `two-factor-recovery-code-used:${user.id}`,
            severity: remaining === 0 ? "warning" : "info",
            title: "Accesso con un codice di recupero",
            message:
                `L'utente "${user.username}" è entrato usando un codice di recupero. ` +
                (remaining === 0
                    ? "Era l'ultimo rimasto: senza rigenerarli, perdere il telefono ora significa non rientrare più."
                    : `Ne restano ${remaining}.`),
            link: "/settings?section=security",
        });
    }

    return createSessionForUser(user);
};

export type TwoFactorStatus = { enabled: boolean; remainingRecoveryCodes: number };

export const getTwoFactorStatus = async (userId: number): Promise<TwoFactorStatus> => {
    const user = await requireUserById(userId);

    return {
        enabled: isTwoFactorActive(user),
        remainingRecoveryCodes: isTwoFactorActive(user) ? await countUnusedRecoveryCodes(userId) : 0,
    };
};

export type TwoFactorSetup = { secretBase32: string; otpauthUri: string; qrDataUrl: string };

export const startTwoFactorSetup = async (userId: number, password: string): Promise<TwoFactorSetup> => {
    const user = await requireUserById(userId);

    if (!(await verifyPassword(password, user.passwordHash))) {
        throw new AuthManagerError("La password non è corretta", 400);
    }

    // Senza questo controllo la sola password basterebbe a sostituire un secondo fattore
    // attivo con uno nuovo: chi l'avesse rubata rientrerebbe, e la 2FA non proteggerebbe
    // proprio dal caso per cui esiste. Per cambiare segreto si disattiva e si riattiva, e
    // disattivare richiede anche un codice.
    if (isTwoFactorActive(user)) {
        throw new AuthManagerError("L'autenticazione a due fattori è già attiva", 400);
    }

    const secretBase32 = generateTotpSecret();
    await db
        .update(userTable)
        .set({ totpSecret: await encryptSecret(secretBase32), totpConfirmedAt: null, totpLastStep: null })
        .where(eq(userTable.id, userId));

    const company = await getCompanySettings();
    const otpauthUri = buildOtpauthUri({ secretBase32, account: user.username, issuer: company.name });

    // Il QR nasce qui e viaggia dentro il JSON come data URL: se il segreto stesse in un URL
    // finirebbe nei log del server, nella cronologia del browser e nel referrer.
    return { secretBase32, otpauthUri, qrDataUrl: await QRCode.toDataURL(otpauthUri) };
};

export const confirmTwoFactorSetup = async (
    userId: number,
    code: string,
    currentSessionToken: string
): Promise<{ recoveryCodes: string[] }> => {
    const user = await requireUserById(userId);

    if (isTwoFactorActive(user)) {
        throw new AuthManagerError("L'autenticazione a due fattori è già attiva", 400);
    }

    const noSetupInProgressError = new AuthManagerError(
        "Nessuna configurazione in corso: ricomincia dall'inizio.",
        400
    );

    if (!user.totpSecret) {
        throw noSetupInProgressError;
    }

    const secret = await readTotpSecret(user);

    if (!secret) {
        throw noSetupInProgressError;
    }

    // Il codice qui non passa da `verifySecondFactor`: quello accetta anche i codici di
    // recupero, che a questo punto non esistono ancora. Serve la prova che l'app abbia
    // davvero acquisito il segreto, e solo un TOTP la fornisce.
    const result = verifyTotp(secret, code);

    if (!result.valid) {
        throw new AuthManagerError("Il codice non è corretto", 400);
    }

    const recoveryCodes = generateRecoveryCodes();

    await db
        .update(userTable)
        .set({ totpConfirmedAt: new Date(), totpLastStep: result.step })
        .where(eq(userTable.id, userId));
    await replaceRecoveryCodes(
        userId,
        recoveryCodes.map((recoveryCode) => hashRecoveryCode(recoveryCode))
    );
    // Come il cambio password: da adesso l'account ha una protezione in più, e le sessioni
    // aperte altrove sono nate senza. Resta viva solo quella da cui è stata attivata.
    await deleteOtherSessionsForUser(userId, currentSessionToken);

    return { recoveryCodes };
};

/**
 * Password *e* secondo fattore: sono le operazioni che indeboliscono o rinnovano la 2FA, e
 * chiederne uno solo la renderebbe aggirabile da chi ha ottenuto quell'uno.
 */
const assertPasswordAndSecondFactor = async (userId: number, password: string, code: string): Promise<UserRow> => {
    const user = await requireUserById(userId);

    if (!(await verifyPassword(password, user.passwordHash))) {
        throw new AuthManagerError("La password non è corretta", 400);
    }

    if (!isTwoFactorActive(user)) {
        throw new AuthManagerError("L'autenticazione a due fattori non è attiva", 400);
    }

    if (!(await verifySecondFactor(user, code)).valid) {
        throw new AuthManagerError("Il codice non è corretto", 400);
    }

    return user;
};

export const disableTwoFactor = async (userId: number, password: string, code: string): Promise<void> => {
    await assertPasswordAndSecondFactor(userId, password, code);
    await clearTwoFactor(userId);
};

export const regenerateRecoveryCodes = async (
    userId: number,
    password: string,
    code: string
): Promise<{ recoveryCodes: string[] }> => {
    await assertPasswordAndSecondFactor(userId, password, code);

    const recoveryCodes = generateRecoveryCodes();
    await replaceRecoveryCodes(
        userId,
        recoveryCodes.map((recoveryCode) => hashRecoveryCode(recoveryCode))
    );

    return { recoveryCodes };
};

/**
 * Sblocco da amministratore per il telefono perso senza codici di recupero rimasti.
 *
 * L'admin non vede mai il segreto e non può leggerlo: può solo toglierlo. È l'unica
 * asimmetria accettabile — e va tenuta tale, perché "mostrami il QR di un altro" sarebbe
 * una scorciatoia per entrare al posto suo.
 */
export const adminDisableTwoFactor = async (userId: number): Promise<PublicUser> => {
    const user = await requireUserById(userId);

    await clearTwoFactor(userId);
    // Se si è arrivati qui è perché l'account era irraggiungibile: eventuali sessioni ancora
    // aperte da qualche parte non sono più fidate.
    await deleteAllSessionsForUser(userId);

    const adminId = await getAdminUserId();
    return toPublicUser({ ...user, totpConfirmedAt: null }, user.id === adminId);
};
