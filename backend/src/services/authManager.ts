import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { and, asc, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { sessionTable, userTable } from "../db/schema";
import {
    consumeRecoveryCode,
    countUnusedRecoveryCodes,
    deleteRecoveryCodes,
    replaceRecoveryCodes,
} from "../db/queries/recoveryCode";
import {
    isIpLoginRateLimited,
    isKnownLoginSource,
    isLoginRateLimited,
    isUsernameLoginRateLimited,
    rateLimitSubject,
    registerFailedLogin,
    registerSuccessfulLogin,
    rememberLoginSource,
} from "./loginRateLimit";
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
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
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
    /**
     * Come `mustChangePassword`: finché è vero l'app non apre nulla se non la configurazione
     * della 2FA. Vale per il solo admin, l'account che lancia gli aggiornamenti (codice
     * eseguito sull'host) e ripristina i backup: rubarlo significa prendersi la macchina.
     */
    twoFactorSetupRequired: boolean;
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
    twoFactorSetupRequired: isAdmin && user.totpConfirmedAt === null,
});

// L'admin è semplicemente il primo account mai registrato (id più basso): non esiste
// un campo "ruolo" separato da mantenere sincronizzato.
const getAdminUserId = async (): Promise<number | null> => {
    const rows = await db.select({ id: userTable.id }).from(userTable).orderBy(asc(userTable.id)).limit(1);
    return rows[0]?.id ?? null;
};

/**
 * Il file con la password generata al primo avvio serve solo finché l'admin non la sostituisce:
 * dopo è una credenziale in chiaro, per giunta scaduta, lasciata sul disco a tempo
 * indeterminato. Un errore qui non deve far fallire né l'avvio né il cambio password.
 */
const removeInitialAdminPasswordFile = async (): Promise<void> => {
    try {
        await fs.promises.rm(initialAdminPasswordFilePath, { force: true });
    } catch (error) {
        console.error("Impossibile rimuovere il file con la password admin iniziale:", error);
    }
};

export const ensureDefaultAdmin = async (): Promise<void> => {
    const [admin] = await db
        .select({ id: userTable.id, mustChangePassword: userTable.mustChangePassword })
        .from(userTable)
        .orderBy(asc(userTable.id))
        .limit(1);

    if (admin) {
        // Ripulisce anche le installazioni esistenti, dove l'admin ha cambiato la password
        // prima che il file venisse cancellato da `changeOwnPassword`.
        if (!admin.mustChangePassword) {
            await removeInitialAdminPasswordFile();
        }
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

const tooManyAttemptsMessage = "Troppi tentativi di accesso falliti. Riprova più tardi.";

const assertLoginRateLimit = (key: string): void => {
    if (isLoginRateLimited(key)) {
        throw new AuthManagerError(tooManyAttemptsMessage, 429);
    }
};

const assertIpLoginRateLimit = (ip: string): void => {
    if (isIpLoginRateLimited(ip)) {
        throw new AuthManagerError(tooManyAttemptsMessage, 429);
    }
};

/**
 * Il contatore della password al login è per coppia IP + nome utente, ed è l'unico che un
 * login riuscito azzera. Prima era per solo IP e lo azzerava *qualunque* login riuscito: chi
 * aveva un account valido poteva provare quattro password su quello dell'admin, entrare con il
 * proprio per ripartire da zero, e ricominciare all'infinito. Ora entrare con il proprio
 * account azzera soltanto il proprio contatore; sopra resta il tetto complessivo per IP
 * (`loginRateLimitMaxAttemptsPerIp`), che non si azzera mai.
 */
const loginAttemptRateLimitKey = (subject: string, username: string) => `accesso:${username}@${subject}`;

/**
 * Il tetto sull'account da qualunque indirizzo, che i contatori per IP non danno: chi ha molti
 * indirizzi li userebbe a turno. Non vale per chi è già entrato con quell'account da lì — il
 * laboratorio, di solito — altrimenti basterebbe un attacco per chiudere fuori il titolare.
 * Il prefisso `nome:` non si confonde con un indirizzo: "n" non è una cifra esadecimale.
 */
const usernameRateLimitKey = (username: string) => `nome:${username}`;

const assertUsernameLoginRateLimit = (username: string, subject: string): void => {
    if (isUsernameLoginRateLimited(usernameRateLimitKey(username)) && !isKnownLoginSource(username, subject)) {
        throw new AuthManagerError(tooManyAttemptsMessage, 429);
    }
};

/**
 * Chiavi per utente, accanto a quelle per IP nello stesso limitatore. Il limite per IP da solo
 * non basta dove il bersaglio è un account preciso: chi ha la password può cambiare IP a ogni
 * giro e continuare a provare codici, e chi ha rubato una sessione può provare password
 * all'infinito sulle rotte che la richiedono di nuovo. Il prefisso `utente:` non può essere
 * scambiato per un indirizzo: "u" non è una cifra esadecimale, quindi nemmeno un IPv6.
 */
const secondFactorRateLimitKey = (userId: number) => `utente:${userId}:secondo-fattore`;
const passwordCheckRateLimitKey = (userId: number) => `utente:${userId}:password`;

/**
 * La password richiesta di nuovo a chi è già dentro (cambio password, attivazione e
 * disattivazione della 2FA). Senza limite, una sessione rubata bastava a indovinare la
 * password a forza bruta: l'unico freno era il costo di scrypt.
 */
const assertCurrentPassword = async (user: UserRow, password: string, errorMessage: string): Promise<void> => {
    const rateLimitKey = passwordCheckRateLimitKey(user.id);
    assertLoginRateLimit(rateLimitKey);

    if (!(await verifyPassword(password, user.passwordHash))) {
        registerFailedLogin(rateLimitKey);
        throw new AuthManagerError(errorMessage, 400);
    }

    registerSuccessfulLogin(rateLimitKey);
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
    const subject = rateLimitSubject(ip);
    const accountRateLimitKey = loginAttemptRateLimitKey(subject, username);
    assertIpLoginRateLimit(subject);
    assertLoginRateLimit(accountRateLimitKey);
    assertUsernameLoginRateLimit(username, subject);

    const invalidCredentialsError = new AuthManagerError("Nome utente o password non validi", 401);
    const rows = await db.select().from(userTable).where(eq(userTable.username, username)).limit(1);
    const user = rows[0];

    // Verifica sempre una password (reale o esca) così il tempo di risposta non rivela
    // se lo username esiste.
    const isPasswordValid = await verifyPassword(password, user ? user.passwordHash : await getDummyPasswordHash());

    if (!user || !isPasswordValid) {
        registerFailedLogin(subject);
        registerFailedLogin(accountRateLimitKey);
        registerFailedLogin(usernameRateLimitKey(username));
        throw invalidCredentialsError;
    }

    // Il contatore si azzera solo quando nasce davvero una sessione, non a password
    // verificata: con la 2FA attiva azzerarlo qui permetteva a chi conosce la password di
    // alternare un login e quattro codici sbagliati, cioè tentativi illimitati sul secondo
    // fattore. Per lo stesso motivo non lo azzera un account disabilitato.
    if (!user.active) {
        throw new AuthManagerError("Questo account è stato disabilitato. Contatta un amministratore.", 403);
    }

    // Il secondo fattore si scopre solo adesso, a password già verificata: annunciarlo prima
    // direbbe a un estraneo quali account sono protetti e quali no.
    if (isTwoFactorActive(user)) {
        // Il segreto non si legge qui ma al secondo passo, e se nel frattempo non si decifra
        // più la 2FA resta al suo posto: si entra con un codice di recupero, che è un hash nel
        // database e non dipende da `data/secret.key` (vedi `readTotpSecret`).
        return { status: "twoFactorRequired", challengeId: createTwoFactorChallenge(user.id) };
    }

    registerSuccessfulLogin(accountRateLimitKey);
    rememberLoginSource(username, subject);
    return createSessionForUser(user);
};

/**
 * Gira a ogni richiesta autenticata, compreso il controllo dello stato dell'aggiornamento che ogni
 * scheda aperta fa ogni pochi secondi: una query sola. Prima erano due — la sessione, poi
 * `getAdminUserId` — cioè due giri verso il database per ogni chiamata all'API. Se l'utente è
 * l'admin (il primo account mai creato) lo dice qui una sottoquery, con la stessa regola di
 * `getAdminUserId`.
 */
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
            isAdmin: sql<boolean>`${userTable.id} = (select min("id") from "user")`,
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

    return toPublicUser(row, row.isAdmin === true);
};

export const deleteSession = (token: string) =>
    db.delete(sessionTable).where(eq(sessionTable.tokenHash, hashSessionToken(token)));

/**
 * `getSessionUser` cancella una sessione scaduta solo se qualcuno presenta proprio quel
 * token: le sessioni di chi chiude il browser e non torna più resterebbero in tabella
 * per sempre. Questa passa periodica le rimuove comunque.
 */
const deleteExpiredSessions = async () => {
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

const deleteAllSessionsForUser = (userId: number) => db.delete(sessionTable).where(eq(sessionTable.userId, userId));

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

    await assertCurrentPassword(user, currentPassword, "La password attuale non è corretta");

    const passwordHash = await hashPassword(newPassword);
    await db.update(userTable).set({ passwordHash, mustChangePassword: false }).where(eq(userTable.id, userId));
    // Disconnette tutte le altre sessioni (es. un token rubato), mantenendo attiva solo quella corrente.
    await deleteOtherSessionsForUser(userId, currentSessionToken);

    if (userId === (await getAdminUserId())) {
        await removeInitialAdminPasswordFile();
    }
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
 * Il segreto in chiaro, oppure null se non c'è o non si decifra.
 *
 * Un segreto che non si decifra lascia la 2FA chiusa, non la toglie. Fino al 2026-09-14 la
 * toglieva e faceva entrare con la sola password, pensando al ripristino su un'altra macchina;
 * ma lo stesso ramo scattava per *qualunque* errore su `data/secret.key`, e diventava un modo
 * per disinnescare il secondo fattore di tutti, admin compreso, a chi ne conosceva la password.
 * Chi resta senza codici dall'app entra con un codice di recupero (hash nel database, non
 * dipendono dalla chiave); un admin può disattivare la 2FA di un altro utente; per l'admin
 * senza codici c'è `scripts/reset-admin-password.sh --reset-2fa` sulla VM.
 *
 * Il ripristino, l'unico caso in cui la chiave cambia di proposito, lo gestisce
 * `clearUnreadableTwoFactorSecrets` alla fine del ripristino stesso.
 */
const readTotpSecret = async (user: UserRow): Promise<string | null> => {
    if (!user.totpSecret) {
        return null;
    }

    try {
        return await decryptSecret(user.totpSecret);
    } catch {
        // Un segreto di una configurazione ancora da confermare non protegge niente: basta
        // ricominciare l'attivazione, non serve avvisare nessuno.
        if (!isTwoFactorActive(user)) {
            return null;
        }

        console.error(`Segreto TOTP non decifrabile per l'utente ${user.id}: la 2FA resta attiva.`);

        await recordNotification({
            dedupeKey: `two-factor-secret-unreadable:${user.id}`,
            severity: "warning",
            title: "Codici dell'app di autenticazione non verificabili",
            message:
                `Il secondo fattore di "${user.username}" non è leggibile con la chiave presente in ` +
                "data/secret.key, quindi i codici dell'app vengono rifiutati. Si entra con un codice di " +
                "recupero; un amministratore può disattivare la 2FA dell'utente dalla gestione utenti, e " +
                "per l'amministratore senza codici resta scripts/reset-admin-password.sh --reset-2fa sulla VM.",
            link: "/settings?section=security",
        });

        return null;
    }
};

/**
 * Dopo un ripristino: toglie la 2FA agli utenti il cui segreto non si decifra con la chiave di
 * questa macchina, e restituisce i loro nomi.
 *
 * `data/secret.key` resta fuori dai backup di proposito (`backupFiles.ts`), quindi un
 * ripristino su un'altra macchina porta segreti che qui non si leggono. È l'unico momento in
 * cui azzerarli è giusto: lo fa un admin già entrato con la sua 2FA, avviando un ripristino,
 * non un errore qualsiasi incontrato al login. Senza, dopo il ripristino su una macchina nuova
 * tutti gli utenti con la 2FA — admin compreso — dovrebbero entrare con i codici di recupero.
 */
export const clearUnreadableTwoFactorSecrets = async (): Promise<string[]> => {
    const users = await db.select().from(userTable).where(isNotNull(userTable.totpSecret));
    const cleared: string[] = [];

    for (const user of users) {
        try {
            await decryptSecret(user.totpSecret!);
        } catch {
            await clearTwoFactor(user.id);
            cleared.push(user.username);
        }
    }

    if (cleared.length > 0) {
        await recordNotification({
            dedupeKey: "two-factor-cleared-after-restore",
            severity: "warning",
            title: "Verifica in due passaggi da riattivare",
            message:
                "Il backup ripristinato è stato cifrato con una chiave diversa da quella di questa macchina: " +
                `la verifica in due passaggi di ${cleared.map((username) => `"${username}"`).join(", ")} ` +
                "è stata disattivata e va riattivata dalle impostazioni.",
            link: "/settings?section=security",
        });
    }

    return cleared;
};

type SecondFactorResult = { valid: false } | { valid: true; usedRecoveryCode: boolean };

/**
 * Verifica il codice del secondo passo, che sia un TOTP o un codice di recupero. Il formato
 * decide da solo quale dei due: otto caratteri dell'alfabeto dei codici di recupero contro
 * sei cifre, quindi nessuna ambiguità e nessuna scelta da chiedere a chi sta entrando.
 */
const checkSecondFactorCode = async (user: UserRow, code: string): Promise<SecondFactorResult> => {
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

/**
 * Il limite sul secondo fattore è per account, non solo per IP e per challenge: il challenge
 * muore dopo cinque codici ma se ne apre un altro rifacendo il login, e l'IP si cambia. Il
 * contatore dell'utente invece segue il bersaglio, da qualunque strada arrivino i tentativi —
 * il login e le rotte che chiedono password e codice passano tutte da qui.
 *
 * Costo accettato: chi conosce la password può tenere l'utente fuori dal secondo passo
 * sbagliando codici di proposito. È il male minore rispetto a indovinarlo, e resta visibile:
 * la password è compromessa e va cambiata comunque.
 */
const verifySecondFactor = async (user: UserRow, code: string): Promise<SecondFactorResult> => {
    const rateLimitKey = secondFactorRateLimitKey(user.id);
    assertLoginRateLimit(rateLimitKey);

    const result = await checkSecondFactorCode(user, code);

    if (result.valid) {
        registerSuccessfulLogin(rateLimitKey);
    } else {
        registerFailedLogin(rateLimitKey);
    }

    return result;
};

export const completeTwoFactorLogin = async (challengeId: string, code: string, ip: string): Promise<LoginResult> => {
    const subject = rateLimitSubject(ip);
    assertIpLoginRateLimit(subject);

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
        // Tre limiti insieme: i tentativi su questo challenge, quelli dell'utente (contati in
        // `verifySecondFactor`) e quelli complessivi dell'IP. Un milione di combinazioni si
        // esaurisce in fretta, se si può provare all'infinito.
        registerFailedLogin(subject);
        const challengeStillOpen = registerFailedTwoFactorAttempt(challengeId);

        throw challengeStillOpen
            ? new AuthManagerError("Codice non valido", 401)
            : new AuthManagerError("Troppi codici errati. Ripeti l'accesso.", 410);
    }

    deleteTwoFactorChallenge(challengeId);
    // Come al primo passo: si azzera il contatore di questo nome utente da questo IP, mai
    // quello complessivo dell'IP.
    registerSuccessfulLogin(loginAttemptRateLimitKey(subject, user.username));
    rememberLoginSource(user.username, subject);

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

    await assertCurrentPassword(user, password, "La password non è corretta");

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

    await assertCurrentPassword(user, password, "La password non è corretta");

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

/**
 * Per le azioni da amministratore rivolte al *proprio* account: una sessione admin rubata
 * non deve bastare a togliere il secondo fattore a chi l'ha aperta. Il codice non si chiede —
 * il caso per cui la rotta esiste è proprio il telefono perso — ma la password sì, con lo
 * stesso limite di tentativi delle altre rotte che la richiedono.
 */
export const assertOwnPassword = async (userId: number, password: string): Promise<void> => {
    const user = await requireUserById(userId);

    await assertCurrentPassword(user, password, "La password non è corretta");
};
