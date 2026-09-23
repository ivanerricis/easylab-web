import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionTable, userTable } from "../db/schema";

/**
 * `authManager` è l'unico servizio che parla con il database senza passare dal query layer,
 * quindi qui il mock è di `db` stesso: un costruttore di query concatenabile che, al momento
 * dell'`await`, restituisce le righe che il test ha preparato per quella coppia
 * operazione+tabella. Non riproduce SQL — non serve, perché quello che va fissato sono le
 * decisioni prese *intorno* alle query, non le query.
 *
 * Le righe sono in coda per chiave: due `select` sulla stessa tabella dentro la stessa
 * chiamata (la ricerca dell'utente e poi quella dell'id più basso per `isAdmin`) escono
 * nell'ordine in cui sono state accodate.
 */
type DbCall = {
    op: "select" | "insert" | "update" | "delete";
    table: unknown;
    values?: Record<string, unknown>;
};

const dbCalls: DbCall[] = [];
const queuedRows = new Map<string, unknown[][]>();

const tableLabel = (table: unknown) => (table === userTable ? "user" : table === sessionTable ? "session" : "altra");

const queueKey = (op: string, table: unknown) => `${op}:${tableLabel(table)}`;

const queueRows = (op: DbCall["op"], table: unknown, rows: unknown[] | Error) => {
    const key = queueKey(op, table);
    const existing = queuedRows.get(key) ?? [];
    existing.push(rows as unknown[]);
    queuedRows.set(key, existing);
};

const createBuilder = (op: DbCall["op"], table?: unknown) => {
    const call: DbCall = { op, table };
    let recorded = false;

    const builder: Record<string, unknown> = {
        from: (value: unknown) => {
            call.table = value;
            return builder;
        },
        values: (value: Record<string, unknown>) => {
            call.values = value;
            return builder;
        },
        set: (value: Record<string, unknown>) => {
            call.values = value;
            return builder;
        },
        where: () => builder,
        innerJoin: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        returning: () => builder,
        then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
            if (!recorded) {
                dbCalls.push(call);
                recorded = true;
            }

            const key = queueKey(op, call.table);
            const rows = queuedRows.get(key)?.shift() ?? [];

            // Un errore accodato al posto delle righe fa fallire la query, come farebbe il driver.
            if (rows instanceof Error) {
                return Promise.reject(rows).then(resolve, reject);
            }

            return Promise.resolve(rows).then(resolve, reject);
        },
    };

    return builder;
};

vi.mock("../db", () => ({
    db: {
        select: () => createBuilder("select"),
        insert: (table: unknown) => createBuilder("insert", table),
        update: (table: unknown) => createBuilder("update", table),
        delete: (table: unknown) => createBuilder("delete", table),
    },
}));

const isLoginRateLimited = vi.fn<(key: string) => boolean>(() => false);
const isIpLoginRateLimited = vi.fn<(ip: string) => boolean>(() => false);
const isUsernameLoginRateLimited = vi.fn<(key: string) => boolean>(() => false);
const isKnownLoginSource = vi.fn<(username: string, subject: string) => boolean>(() => false);
const registerFailedLogin = vi.fn();
const registerSuccessfulLogin = vi.fn();
const rememberLoginSource = vi.fn();

// `rateLimitSubject` resta quello vero: che le chiavi nascano dal /64 e non dall'indirizzo
// esatto è una decisione di authManager da fissare, non un dettaglio del limitatore.
vi.mock("./loginRateLimit", async () => {
    const actual = await vi.importActual<typeof import("./loginRateLimit")>("./loginRateLimit");

    return {
        rateLimitSubject: actual.rateLimitSubject,
        isLoginRateLimited: (key: string) => isLoginRateLimited(key) as boolean,
        isIpLoginRateLimited: (ip: string) => isIpLoginRateLimited(ip) as boolean,
        isUsernameLoginRateLimited: (key: string) => isUsernameLoginRateLimited(key) as boolean,
        isKnownLoginSource: (username: string, subject: string) => isKnownLoginSource(username, subject) as boolean,
        registerFailedLogin: (key: string) => registerFailedLogin(key),
        registerSuccessfulLogin: (key: string) => registerSuccessfulLogin(key),
        rememberLoginSource: (username: string, subject: string) => rememberLoginSource(username, subject),
    };
});

const decryptSecret = vi.fn();

vi.mock("./secretCrypto", () => ({
    decryptSecret: (payload: string) => decryptSecret(payload) as Promise<string>,
    encryptSecret: (value: string) => Promise.resolve(`cifrato:${value}`),
}));

const createTwoFactorChallenge = vi.fn<(userId: number) => string>(() => "challenge-1");
const getTwoFactorChallengeUserId = vi.fn<(challengeId: string) => number | null>(() => null);
const registerFailedTwoFactorAttempt = vi.fn<(challengeId: string) => boolean>(() => true);

const deleteTwoFactorChallenge = vi.fn();

vi.mock("./twoFactorChallenge", () => ({
    createTwoFactorChallenge: (userId: number) => createTwoFactorChallenge(userId) as string,
    deleteTwoFactorChallenge: (challengeId: string) => deleteTwoFactorChallenge(challengeId),
    getTwoFactorChallengeUserId: (challengeId: string) => getTwoFactorChallengeUserId(challengeId) as number | null,
    registerFailedTwoFactorAttempt: (challengeId: string) => registerFailedTwoFactorAttempt(challengeId) as boolean,
}));

const deleteRecoveryCodes = vi.fn();
const consumeRecoveryCode = vi.fn<(userId: number, codeHash: string) => Promise<boolean>>(() => Promise.resolve(false));
const countUnusedRecoveryCodes = vi.fn<(userId: number) => Promise<number>>(() => Promise.resolve(0));
const replaceRecoveryCodes = vi.fn<(userId: number, codeHashes: string[]) => Promise<void>>(() => Promise.resolve());

vi.mock("../db/queries/recoveryCode", () => ({
    consumeRecoveryCode: (userId: number, codeHash: string) => consumeRecoveryCode(userId, codeHash),
    countUnusedRecoveryCodes: (userId: number) => countUnusedRecoveryCodes(userId),
    deleteRecoveryCodes: (userId: number) => deleteRecoveryCodes(userId),
    replaceRecoveryCodes: (userId: number, codeHashes: string[]) => replaceRecoveryCodes(userId, codeHashes),
}));

const recordNotification = vi.fn();

vi.mock("./notificationManager", () => ({
    recordNotification: (input: unknown) => recordNotification(input),
}));

const getCompanySettings = vi.fn<() => Promise<{ name: string; email?: string }>>(() =>
    Promise.resolve({ name: "Laboratorio" })
);

vi.mock("./companyManager", () => ({
    getCompanySettings: () => getCompanySettings(),
}));

const isEmailConfigured = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
const sendEmail = vi.fn<(input: unknown) => Promise<void>>(() => Promise.resolve());

vi.mock("./emailManager", () => ({
    isEmailConfigured: () => isEmailConfigured(),
    sendEmail: (input: unknown) => sendEmail(input),
}));

// Il file con la password admin iniziale sta nel vero `data/`: nessun test deve toccarlo.
const rm = vi.fn();
const mkdir = vi.fn();
const writeFile = vi.fn();

vi.mock("node:fs", () => {
    const promises = {
        rm: (...args: unknown[]) => rm(...args),
        mkdir: (...args: unknown[]) => mkdir(...args),
        writeFile: (...args: unknown[]) => writeFile(...args),
    };
    return { default: { promises }, promises };
});

import {
    AuthManagerError,
    adminDisableTwoFactor,
    assertOwnPassword,
    changeOwnPassword,
    clearUnreadableTwoFactorSecrets,
    completeTwoFactorLogin,
    confirmTwoFactorSetup,
    createUser,
    deleteSession,
    deleteUser,
    disableTwoFactor,
    ensureDefaultAdmin,
    getSessionUser,
    getTwoFactorStatus,
    listSessionsForUser,
    listUsers,
    login,
    regeneratePassword,
    regenerateRecoveryCodes,
    revokeSession,
    setUserActive,
    startSessionCleanupScheduler,
    startTwoFactorSetup,
    stopSessionCleanupScheduler,
} from "./authManager";
import { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } from "./recoveryCodes";
import { generateTotpCode, stepForTimestamp } from "./totp";

/** Nello stesso formato prodotto da `hashPassword`: `salt:derivata`, scrypt a 64 byte. */
const hashLikeTheAppDoes = (password: string) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
};

const passwordHash = hashLikeTheAppDoes("password-giusta");

const buildUser = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    username: "mario",
    passwordHash,
    mustChangePassword: false,
    active: true,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: null,
    totpSecret: null,
    totpConfirmedAt: null,
    totpLastStep: null,
    ...overrides,
});

/** L'id più basso, che è ciò che rende amministratore un utente: nessun campo "ruolo". */
const queueAdminIdLookup = (adminId: number) => queueRows("select", userTable, [{ id: adminId }]);

/**
 * L'email di avviso nuovo dispositivo parte senza `await` (D2, vedi CHANGELOG): per osservarne
 * gli effetti nei test bisogna lasciare girare la coda dei microtask dopo che `login`/
 * `completeTwoFactorLogin` si sono già risolti, non basta l'`await` sulla funzione principale.
 */
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    dbCalls.length = 0;
    queuedRows.clear();
    vi.clearAllMocks();
    isLoginRateLimited.mockReturnValue(false);
    isIpLoginRateLimited.mockReturnValue(false);
    isUsernameLoginRateLimited.mockReturnValue(false);
    isKnownLoginSource.mockReturnValue(false);
    consumeRecoveryCode.mockResolvedValue(false);
    countUnusedRecoveryCodes.mockResolvedValue(0);
    createTwoFactorChallenge.mockReturnValue("challenge-1");
    getTwoFactorChallengeUserId.mockReturnValue(null);
    registerFailedTwoFactorAttempt.mockReturnValue(true);
    getCompanySettings.mockResolvedValue({ name: "Laboratorio" });
    isEmailConfigured.mockResolvedValue(false);
});

/** Un segreto Base32 valido: `verifyTotp` non è mockato, i codici si calcolano davvero. */
const totpSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const buildTwoFactorUser = (overrides: Record<string, unknown> = {}) =>
    buildUser({ totpSecret: "cifrato", totpConfirmedAt: new Date("2026-02-01T00:00:00Z"), ...overrides });

/** Le chiavi del limitatore, per distinguerle nelle asserzioni da quella del solo IP. */
const secondFactorKey = "utente:7:secondo-fattore";
const passwordKey = "utente:7:password";
const accountKey = "accesso:mario@1.2.3.4";
const usernameKey = "nome:mario";

describe("login", () => {
    it("rifiuta con 429 senza nemmeno cercare l'utente quando l'IP ha superato il tetto complessivo", async () => {
        isIpLoginRateLimited.mockReturnValue(true);

        await expect(login("mario", "password-giusta", "1.2.3.4")).rejects.toMatchObject({
            statusCode: 429,
        });

        expect(dbCalls).toHaveLength(0);
        expect(registerFailedLogin).not.toHaveBeenCalled();
    });

    it("rifiuta con 429 senza nemmeno cercare l'utente quando quel nome utente ha sbagliato troppe volte da quell'IP", async () => {
        isLoginRateLimited.mockImplementation((key) => key === accountKey);

        await expect(login("mario", "password-giusta", "1.2.3.4")).rejects.toMatchObject({
            statusCode: 429,
        });

        expect(isLoginRateLimited).toHaveBeenCalledWith(accountKey);
        expect(dbCalls).toHaveLength(0);
    });

    it("una password sbagliata conta per l'IP, per il nome utente da quell'IP e per il nome utente ovunque", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(login("mario", "password-sbagliata", "1.2.3.4")).rejects.toMatchObject({ statusCode: 401 });

        expect(registerFailedLogin).toHaveBeenCalledWith("1.2.3.4");
        expect(registerFailedLogin).toHaveBeenCalledWith(accountKey);
        expect(registerFailedLogin).toHaveBeenCalledWith(usernameKey);
    });

    /**
     * Il buco che questo test chiude: con la chiave sull'indirizzo esatto, un /64 — cioè 2^64
     * indirizzi, quanti ne ha qualunque VPS — valeva come 2^64 contatori nuovi.
     */
    it("da IPv6 conta per il prefisso /64, non per l'indirizzo esatto", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(login("mario", "password-sbagliata", "2001:db8:1:2::abcd")).rejects.toMatchObject({
            statusCode: 401,
        });

        expect(registerFailedLogin).toHaveBeenCalledWith("2001:db8:1:2::/64");
        expect(registerFailedLogin).toHaveBeenCalledWith("accesso:mario@2001:db8:1:2::/64");
    });

    it("con l'account sotto attacco rifiuta con 429 chi non ci è mai entrato da quell'indirizzo", async () => {
        isUsernameLoginRateLimited.mockImplementation((key) => key === usernameKey);

        await expect(login("mario", "password-giusta", "5.6.7.8")).rejects.toMatchObject({ statusCode: 429 });

        expect(isKnownLoginSource).toHaveBeenCalledWith("mario", "5.6.7.8");
        expect(dbCalls).toHaveLength(0);
    });

    /**
     * Il costo che il tetto per nome utente non deve avere: chi attacca un account da mille
     * indirizzi non deve poter chiudere fuori il titolare, che entra dal solito posto.
     */
    it("con l'account sotto attacco lascia provare chi ci è già entrato da quell'indirizzo", async () => {
        isUsernameLoginRateLimited.mockImplementation((key) => key === usernameKey);
        isKnownLoginSource.mockReturnValue(true);
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(1);

        const result = await login("mario", "password-giusta", "1.2.3.4");

        expect(result.status).toBe("authenticated");
    });

    it("un login riuscito ricorda l'indirizzo come già usato per quell'account", async () => {
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(1);

        await login("mario", "password-giusta", "1.2.3.4");

        expect(rememberLoginSource).toHaveBeenCalledWith("mario", "1.2.3.4");
    });

    it("una password sbagliata non rende l'indirizzo già usato", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(login("mario", "password-sbagliata", "1.2.3.4")).rejects.toMatchObject({ statusCode: 401 });

        expect(rememberLoginSource).not.toHaveBeenCalled();
    });

    /**
     * Il punto non è il messaggio, è il *tempo*: uscire subito quando lo username non esiste
     * renderebbe il login più veloce per gli username inesistenti che per quelli veri, e
     * quella differenza è sufficiente a farsi elencare gli account dall'esterno. Per questo
     * viene verificata comunque una password esca, ed è quello che il test controlla.
     */
    it("verifica comunque una password quando lo username non esiste, e risponde come per una password sbagliata", async () => {
        const scrypt = vi.spyOn(crypto, "scrypt");

        queueRows("select", userTable, []);
        const utenteInesistente = await login("nessuno", "qualsiasi", "1.2.3.4").catch(
            (error: AuthManagerError) => error
        );

        expect(scrypt).toHaveBeenCalled();

        scrypt.mockClear();
        queueRows("select", userTable, [buildUser()]);
        const passwordSbagliata = await login("mario", "password-sbagliata", "1.2.3.4").catch(
            (error: AuthManagerError) => error
        );

        expect(scrypt).toHaveBeenCalled();
        expect(utenteInesistente).toBeInstanceOf(Error);
        expect(passwordSbagliata).toBeInstanceOf(Error);
        expect((utenteInesistente as AuthManagerError).message).toBe((passwordSbagliata as AuthManagerError).message);
        expect((utenteInesistente as AuthManagerError).statusCode).toBe(
            (passwordSbagliata as AuthManagerError).statusCode
        );
        // Ognuno dei due conta per l'IP, per il nome utente da quell'IP e per il nome utente
        // ovunque: nemmeno il limitatore tratta diversamente chi non esiste.
        expect(registerFailedLogin).toHaveBeenCalledTimes(6);
        expect(registerFailedLogin).toHaveBeenCalledWith("accesso:nessuno@1.2.3.4");
        expect(registerFailedLogin).toHaveBeenCalledWith("nome:nessuno");

        scrypt.mockRestore();
    });

    it("nega l'accesso a un account disattivato solo dopo aver verificato la password", async () => {
        queueRows("select", userTable, [buildUser({ active: false })]);

        await expect(login("mario", "password-giusta", "1.2.3.4")).rejects.toMatchObject({ statusCode: 403 });

        // La password era giusta: il tentativo non conta come fallito, ma nemmeno azzera il
        // contatore dell'IP, perché nessuna sessione nasce.
        expect(registerSuccessfulLogin).not.toHaveBeenCalled();
        expect(registerFailedLogin).not.toHaveBeenCalled();
        expect(dbCalls.some((call) => call.op === "insert" && call.table === sessionTable)).toBe(false);
    });

    /**
     * Il buco che questo test chiude: prima un login riuscito azzerava il contatore dell'IP,
     * quindi chi aveva un account valido poteva provare quattro password su quello dell'admin,
     * entrare con il proprio per ripartire da zero, e ricominciare all'infinito. Ora si azzera
     * solo il contatore di chi è appena entrato: quello dell'IP e degli altri nomi restano.
     */
    it("un login riuscito azzera solo il contatore di quel nome utente, mai quello dell'IP", async () => {
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(1);

        await login("mario", "password-giusta", "1.2.3.4");

        expect(registerSuccessfulLogin).toHaveBeenCalledOnce();
        expect(registerSuccessfulLogin).toHaveBeenCalledWith(accountKey);
        expect(registerSuccessfulLogin).not.toHaveBeenCalledWith("1.2.3.4");
    });

    /**
     * Il buco che questo test chiude: azzerare il contatore già a password giusta lasciava a
     * chi la conosce un ciclo infinito — login, quattro codici sbagliati, di nuovo login —
     * cioè tentativi illimitati sul secondo fattore.
     */
    it("con la 2FA attiva la sola password non azzera il contatore dell'IP", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);
        decryptSecret.mockResolvedValue(totpSecret);

        const result = await login("mario", "password-giusta", "1.2.3.4");

        expect(result.status).toBe("twoFactorRequired");
        expect(registerSuccessfulLogin).not.toHaveBeenCalled();
    });

    it("salva nella sessione l'hash del token, mai il token che finisce nel cookie", async () => {
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(1);

        const result = await login("mario", "password-giusta", "1.2.3.4");

        expect(result.status).toBe("authenticated");
        const token = result.status === "authenticated" ? result.token : "";
        const inserted = dbCalls.find((call) => call.op === "insert" && call.table === sessionTable);

        expect(inserted?.values?.tokenHash).toBe(crypto.createHash("sha256").update(token).digest("hex"));
        expect(inserted?.values?.tokenHash).not.toBe(token);
        expect(JSON.stringify(inserted?.values)).not.toContain(token);
    });

    /** Serve a distinguere due accessi dello stesso utente da macchine diverse: l'etichetta
     * la ricava `describeUserAgent` al momento della lettura, qui si fissa che l'header
     * dell'accesso venga davvero registrato, ripulito e tagliato alla colonna. */
    it("registra il dispositivo da cui è stato fatto l'accesso", async () => {
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(1);

        await login(
            "mario",
            "password-giusta",
            "1.2.3.4",
            `Mozilla/5.0 (Windows NT 10.0)
${"x".repeat(400)}`
        );

        const inserted = dbCalls.find((call) => call.op === "insert" && call.table === sessionTable);
        expect(inserted?.values?.userAgent).toBe(`Mozilla/5.0 (Windows NT 10.0) ${"x".repeat(400)}`.slice(0, 255));
    });

    it("senza header non inventa un dispositivo", async () => {
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(1);

        await login("mario", "password-giusta", "1.2.3.4");

        const inserted = dbCalls.find((call) => call.op === "insert" && call.table === sessionTable);
        expect(inserted?.values?.userAgent).toBeNull();
    });

    const chromeOnWindows =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

    describe("avviso di nuovo dispositivo", () => {
        it("un dispositivo mai visto per l'utente avvisa e si aggiunge a quelli noti", async () => {
            queueRows("select", userTable, [buildUser({ knownDeviceLabels: null })]);
            queueAdminIdLookup(1);

            await login("mario", "password-giusta", "1.2.3.4", chromeOnWindows);

            const updated = dbCalls.find((call) => call.op === "update" && call.table === userTable);
            expect(JSON.parse(updated?.values?.knownDeviceLabels as string)).toEqual(["Chrome su Windows"]);
            expect(recordNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    dedupeKey: "new-device-login:7:Chrome su Windows",
                    message: expect.stringContaining('"mario"') as unknown,
                })
            );
        });

        it("un dispositivo già noto non riscrive l'elenco né avvisa di nuovo", async () => {
            queueRows("select", userTable, [buildUser({ knownDeviceLabels: JSON.stringify(["Chrome su Windows"]) })]);
            queueAdminIdLookup(1);

            await login("mario", "password-giusta", "1.2.3.4", chromeOnWindows);

            expect(dbCalls.some((call) => call.op === "update" && call.table === userTable)).toBe(false);
            expect(recordNotification).not.toHaveBeenCalled();
        });

        it("senza un'etichetta riconoscibile non avvisa né scrive niente", async () => {
            queueRows("select", userTable, [buildUser({ knownDeviceLabels: null })]);
            queueAdminIdLookup(1);

            await login("mario", "password-giusta", "1.2.3.4");

            expect(dbCalls.some((call) => call.op === "update" && call.table === userTable)).toBe(false);
            expect(recordNotification).not.toHaveBeenCalled();
        });

        it("manda anche l'email al laboratorio, se l'SMTP è configurato e l'indirizzo è impostato", async () => {
            isEmailConfigured.mockResolvedValue(true);
            getCompanySettings.mockResolvedValue({ name: "Laboratorio", email: "titolare@esempio.it" });
            queueRows("select", userTable, [buildUser({ knownDeviceLabels: null })]);
            queueAdminIdLookup(1);

            await login("mario", "password-giusta", "1.2.3.4", chromeOnWindows);
            await flushMicrotasks();

            // L'oggetto e il testo devono nominare EasyLab, non solo il laboratorio: chi
            // riceve l'email potrebbe avere altri sistemi con notifiche simili (vedi CHANGELOG).
            expect(sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: "titolare@esempio.it",
                    subject: "Nuovo accesso a EasyLab - Laboratorio",
                    text: expect.stringContaining('"mario"') as unknown,
                })
            );
            expect(sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: expect.stringContaining("EasyLab, il gestionale di Laboratorio") as unknown,
                })
            );
        });

        it("senza email del laboratorio configurata non tenta l'invio", async () => {
            isEmailConfigured.mockResolvedValue(true);
            queueRows("select", userTable, [buildUser({ knownDeviceLabels: null })]);
            queueAdminIdLookup(1);

            await login("mario", "password-giusta", "1.2.3.4", chromeOnWindows);
            await flushMicrotasks();

            expect(sendEmail).not.toHaveBeenCalled();
        });

        /**
         * D2: prima il login attendeva anche l'invio della mail (`await sendEmail` dentro
         * `notifyIfNewDevice`, a sua volta atteso da `createSessionForUser`). Con l'SMTP
         * irraggiungibile — e senza i timeout aggiunti a `buildTransporter`, fino a 2 minuti di
         * default — la sessione nasceva ma il cookie non arrivava mai in tempo al browser, dietro
         * un Cloudflare Tunnel che chiude a ~100s con un 524. Qui la mail non si risolve mai: se
         * il login la stesse ancora aspettando, questo test non finirebbe.
         */
        it("il login si conclude anche se l'invio della mail di avviso resta appeso", async () => {
            isEmailConfigured.mockResolvedValue(true);
            getCompanySettings.mockResolvedValue({ name: "Laboratorio", email: "titolare@esempio.it" });
            sendEmail.mockImplementation(() => new Promise(() => {}));
            queueRows("select", userTable, [buildUser({ knownDeviceLabels: null })]);
            queueAdminIdLookup(1);

            const result = await login("mario", "password-giusta", "1.2.3.4", chromeOnWindows);

            expect(result.status).toBe("authenticated");
        });
    });

    it("è amministratore solo l'utente con l'id più basso", async () => {
        queueRows("select", userTable, [buildUser({ id: 7 })]);
        queueAdminIdLookup(7);

        const admin = await login("mario", "password-giusta", "1.2.3.4");
        expect(admin.status === "authenticated" && admin.user.isAdmin).toBe(true);

        dbCalls.length = 0;
        queueRows("select", userTable, [buildUser({ id: 7 })]);
        queueAdminIdLookup(1);

        const nonAdmin = await login("mario", "password-giusta", "1.2.3.4");
        expect(nonAdmin.status === "authenticated" && nonAdmin.user.isAdmin).toBe(false);
    });

    /** L'obbligo riguarda solo l'admin: agli altri utenti la 2FA resta una scelta. */
    it("impone la configurazione della 2FA all'admin che non l'ha attiva, e solo a lui", async () => {
        queueRows("select", userTable, [buildUser({ id: 7 })]);
        queueAdminIdLookup(7);

        const admin = await login("mario", "password-giusta", "1.2.3.4");
        expect(admin.status === "authenticated" && admin.user.twoFactorSetupRequired).toBe(true);

        dbCalls.length = 0;
        queueRows("select", userTable, [buildUser({ id: 7 })]);
        queueAdminIdLookup(1);

        const nonAdmin = await login("mario", "password-giusta", "1.2.3.4");
        expect(nonAdmin.status === "authenticated" && nonAdmin.user.twoFactorSetupRequired).toBe(false);
    });

    /**
     * Il secondo fattore viene annunciato solo qui, a password già verificata: dirlo prima
     * direbbe a un estraneo quali account sono protetti e quali no.
     */
    it("con la 2FA attiva chiede il secondo fattore e non crea nessuna sessione", async () => {
        queueRows("select", userTable, [
            buildUser({ totpSecret: "cifrato", totpConfirmedAt: new Date("2026-02-01T00:00:00Z") }),
        ]);
        decryptSecret.mockResolvedValue("SEGRETOBASE32");

        const result = await login("mario", "password-giusta", "1.2.3.4");

        expect(result).toEqual({ status: "twoFactorRequired", challengeId: "challenge-1" });
        expect(createTwoFactorChallenge).toHaveBeenCalledWith(7);
        expect(dbCalls.some((call) => call.op === "insert" && call.table === sessionTable)).toBe(false);
    });

    /**
     * Il buco che questo test chiude: prima un segreto illeggibile azzerava la 2FA e faceva
     * entrare con la sola password. Bastava far fallire una volta la lettura di
     * `data/secret.key` per disinnescare il secondo fattore di tutti, admin compreso.
     */
    it("se il segreto TOTP non è più leggibile chiede comunque il secondo fattore e non tocca la 2FA", async () => {
        queueRows("select", userTable, [buildTwoFactorUser({ totpSecret: "cifrato-con-un-altra-chiave" })]);
        decryptSecret.mockRejectedValue(new Error("chiave diversa"));

        const result = await login("mario", "password-giusta", "1.2.3.4");

        expect(result).toEqual({ status: "twoFactorRequired", challengeId: "challenge-1" });
        expect(dbCalls.some((call) => call.op === "update" && call.table === userTable)).toBe(false);
        expect(deleteRecoveryCodes).not.toHaveBeenCalled();
    });
});

describe("getSessionUser", () => {
    const sessionRow = (overrides: Record<string, unknown> = {}) => ({
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        id: 7,
        username: "mario",
        created_at: new Date("2026-01-01T00:00:00Z"),
        mustChangePassword: false,
        active: true,
        totpConfirmedAt: null,
        // La sottoquery sul primo account: la calcola Postgres, qui arriva come colonna.
        isAdmin: false,
        ...overrides,
    });

    /**
     * Gira a ogni richiesta autenticata: una query sola, con l'essere admin calcolato dentro,
     * invece della sessione più una seconda lettura per sapere chi è l'admin.
     */
    it("restituisce l'utente della sessione valida con una sola lettura", async () => {
        queueRows("select", sessionTable, [sessionRow()]);

        const user = await getSessionUser("token-in-chiaro");

        expect(user).toMatchObject({ id: 7, username: "mario", isAdmin: false });
        expect(dbCalls).toHaveLength(1);
        expect(dbCalls.some((call) => call.op === "delete")).toBe(false);
    });

    it("smette di imporre la configurazione all'admin appena la 2FA è attiva", async () => {
        queueRows("select", sessionTable, [
            sessionRow({ isAdmin: true, totpConfirmedAt: new Date("2026-02-01T00:00:00Z") }),
        ]);

        const user = await getSessionUser("token-in-chiaro");

        expect(user).toMatchObject({ isAdmin: true, twoFactorEnabled: true, twoFactorSetupRequired: false });
    });

    it("cerca la sessione partendo dalla tabella delle sessioni, senza scrivere il token", async () => {
        queueRows("select", sessionTable, []);

        await getSessionUser("token-in-chiaro");

        expect(dbCalls[0]).toMatchObject({ op: "select", table: sessionTable });
        expect(dbCalls.every((call) => !JSON.stringify(call.values ?? {}).includes("token-in-chiaro"))).toBe(true);
    });

    it("scaduta: nessun utente e la riga viene rimossa", async () => {
        queueRows("select", sessionTable, [sessionRow({ expiresAt: new Date(Date.now() - 1000) })]);

        const user = await getSessionUser("token-in-chiaro");

        expect(user).toBeNull();
        expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
    });

    /**
     * Disattivare un account deve avere effetto subito, anche su chi è già dentro: la
     * sessione esistente smette di valere alla prima richiesta e viene rimossa.
     */
    it("utente disattivato: nessun utente e la riga viene rimossa", async () => {
        queueRows("select", sessionTable, [sessionRow({ active: false })]);

        const user = await getSessionUser("token-in-chiaro");

        expect(user).toBeNull();
        expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
    });

    /**
     * La colonna serve a distinguere, nell'elenco delle sessioni, quella in uso da quella
     * aperta e poi abbandonata: senza questa scrittura resterebbero identiche.
     */
    it("segna l'ultimo utilizzo quando è passato abbastanza tempo", async () => {
        queueRows("select", sessionTable, [sessionRow({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) })]);

        await getSessionUser("token-in-chiaro");

        const update = dbCalls.find((call) => call.op === "update" && call.table === sessionTable);
        expect(update?.values?.lastSeenAt).toBeInstanceOf(Date);
    });

    it("non riscrive l'ultimo utilizzo a ogni richiesta", async () => {
        queueRows("select", sessionTable, [sessionRow({ lastSeenAt: new Date(Date.now() - 60 * 1000) })]);

        await getSessionUser("token-in-chiaro");

        expect(dbCalls.some((call) => call.op === "update")).toBe(false);
    });

    it("token sconosciuto: nessun utente e niente da cancellare", async () => {
        queueRows("select", sessionTable, []);

        const user = await getSessionUser("token-mai-emesso");

        expect(user).toBeNull();
        expect(dbCalls.some((call) => call.op === "delete")).toBe(false);
    });
});

/** Un codice a sei cifre che non è valido in nessuno dei tre passi accettati adesso. */
const wrongTotpCode = () => {
    const nearbyCodes = [-30_000, 0, 30_000].map((offset) => generateTotpCode(totpSecret, Date.now() + offset));
    return ["000000", "111111", "222222", "333333"].find((code) => !nearbyCodes.includes(code))!;
};

describe("completeTwoFactorLogin", () => {
    beforeEach(() => {
        getTwoFactorChallengeUserId.mockReturnValue(7);
        decryptSecret.mockResolvedValue(totpSecret);
    });

    it("con il codice giusto crea la sessione e azzera i contatori dell'utente, non quello dell'IP", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);
        queueAdminIdLookup(1);

        const result = await completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "1.2.3.4");

        expect(result.status).toBe("authenticated");
        expect(registerSuccessfulLogin).toHaveBeenCalledWith(accountKey);
        expect(registerSuccessfulLogin).toHaveBeenCalledWith(secondFactorKey);
        expect(registerSuccessfulLogin).not.toHaveBeenCalledWith("1.2.3.4");
    });

    it("rifiuta con 429 senza cercare il challenge quando l'IP ha superato il tetto complessivo", async () => {
        isIpLoginRateLimited.mockReturnValue(true);

        await expect(
            completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "1.2.3.4")
        ).rejects.toMatchObject({ statusCode: 429 });

        expect(getTwoFactorChallengeUserId).not.toHaveBeenCalled();
    });

    it("un codice sbagliato conta contro l'IP e contro l'utente", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(completeTwoFactorLogin("challenge-1", wrongTotpCode(), "1.2.3.4")).rejects.toMatchObject({
            statusCode: 401,
        });

        expect(registerFailedLogin).toHaveBeenCalledWith("1.2.3.4");
        expect(registerFailedLogin).toHaveBeenCalledWith(secondFactorKey);
        expect(registerFailedTwoFactorAttempt).toHaveBeenCalledWith("challenge-1");
    });

    /**
     * Il limite che conta: segue l'account, non l'IP né il challenge. Cambiare indirizzo o
     * rifare il login per ottenere un challenge nuovo non restituisce tentativi.
     */
    it("rifiuta con 429 senza nemmeno verificare il codice quando l'utente ha esaurito i tentativi", async () => {
        isLoginRateLimited.mockImplementation((key) => key === secondFactorKey);
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(
            completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "9.9.9.9")
        ).rejects.toMatchObject({ statusCode: 429 });

        expect(decryptSecret).not.toHaveBeenCalled();
        expect(dbCalls.some((call) => call.op === "insert" && call.table === sessionTable)).toBe(false);
    });

    it("con il codice giusto ricorda l'indirizzo come già usato per quell'account", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);
        queueAdminIdLookup(1);

        await completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "1.2.3.4");

        expect(rememberLoginSource).toHaveBeenCalledWith("mario", "1.2.3.4");
    });

    describe("con il segreto TOTP illeggibile", () => {
        beforeEach(() => {
            decryptSecret.mockRejectedValue(new Error("chiave diversa"));
        });

        it("rifiuta anche il codice giusto dell'app, lascia la 2FA com'è e avvisa chi amministra", async () => {
            queueRows("select", userTable, [buildTwoFactorUser()]);

            await expect(
                completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "1.2.3.4")
            ).rejects.toMatchObject({ statusCode: 401 });

            expect(dbCalls.some((call) => call.op === "update" && call.table === userTable)).toBe(false);
            expect(deleteRecoveryCodes).not.toHaveBeenCalled();
            expect(recordNotification).toHaveBeenCalledWith(
                expect.objectContaining({ dedupeKey: "two-factor-secret-unreadable:7" })
            );
        });

        /** La via d'uscita che rende sicuro fallire chiusi: i codici di recupero non dipendono dalla chiave. */
        it("fa entrare con un codice di recupero", async () => {
            queueRows("select", userTable, [buildTwoFactorUser()]);
            queueAdminIdLookup(1);
            consumeRecoveryCode.mockResolvedValue(true);

            const result = await completeTwoFactorLogin("challenge-1", generateRecoveryCodes()[0], "1.2.3.4");

            expect(result.status).toBe("authenticated");
            expect(decryptSecret).not.toHaveBeenCalled();
        });
    });
});

describe("clearUnreadableTwoFactorSecrets", () => {
    it("toglie la 2FA solo a chi ha un segreto che non si decifra, e lo annuncia", async () => {
        queueRows("select", userTable, [
            buildTwoFactorUser({ id: 7, username: "mario", totpSecret: "leggibile" }),
            buildTwoFactorUser({ id: 8, username: "anna", totpSecret: "illeggibile" }),
        ]);
        decryptSecret.mockImplementation((payload: string) =>
            payload === "leggibile" ? Promise.resolve(totpSecret) : Promise.reject(new Error("chiave diversa"))
        );

        const cleared = await clearUnreadableTwoFactorSecrets();

        expect(cleared).toEqual(["anna"]);
        const azzeramenti = dbCalls.filter((call) => call.op === "update" && call.table === userTable);
        expect(azzeramenti).toHaveLength(1);
        expect(azzeramenti[0].values).toMatchObject({ totpSecret: null, totpConfirmedAt: null, totpLastStep: null });
        expect(deleteRecoveryCodes).toHaveBeenCalledWith(8);
        expect(deleteRecoveryCodes).not.toHaveBeenCalledWith(7);
        expect(recordNotification).toHaveBeenCalledWith(
            expect.objectContaining({ dedupeKey: "two-factor-cleared-after-restore" })
        );
    });

    it("se tutti i segreti si decifrano non cambia niente e non avvisa nessuno", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);
        decryptSecret.mockResolvedValue(totpSecret);

        expect(await clearUnreadableTwoFactorSecrets()).toEqual([]);
        expect(dbCalls.some((call) => call.op === "update")).toBe(false);
        expect(recordNotification).not.toHaveBeenCalled();
    });
});

describe("changeOwnPassword", () => {
    it("con la password attuale giusta la cambia e azzera il contatore dell'utente", async () => {
        queueRows("select", userTable, [buildUser()]);

        await changeOwnPassword(7, "password-giusta", "Nuova-password-1!", "token-corrente");

        expect(registerSuccessfulLogin).toHaveBeenCalledWith(passwordKey);
        expect(dbCalls.some((call) => call.op === "update" && call.table === userTable)).toBe(true);
    });

    it("una password attuale sbagliata conta contro l'utente", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(
            changeOwnPassword(7, "password-sbagliata", "Nuova-password-1!", "token-corrente")
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(registerFailedLogin).toHaveBeenCalledWith(passwordKey);
        expect(dbCalls.some((call) => call.op === "update")).toBe(false);
    });

    /** Una sessione rubata non deve bastare a indovinare la password a forza bruta. */
    it("rifiuta con 429 senza verificare la password quando l'utente ha esaurito i tentativi", async () => {
        isLoginRateLimited.mockImplementation((key) => key === passwordKey);
        const scrypt = vi.spyOn(crypto, "scrypt");
        queueRows("select", userTable, [buildUser()]);

        await expect(
            changeOwnPassword(7, "password-giusta", "Nuova-password-1!", "token-corrente")
        ).rejects.toMatchObject({ statusCode: 429 });

        expect(scrypt).not.toHaveBeenCalled();
        expect(dbCalls.some((call) => call.op === "update")).toBe(false);

        scrypt.mockRestore();
    });

    it("quando è l'admin a cambiarla, cancella il file con la password iniziale", async () => {
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(7);

        await changeOwnPassword(7, "password-giusta", "Nuova-password-1!", "token-corrente");

        expect(rm).toHaveBeenCalledWith(expect.stringMatching(/initial-admin-password\.txt$/), { force: true });
    });

    it("quando la cambia un altro utente, il file dell'admin resta dov'è", async () => {
        queueRows("select", userTable, [buildUser()]);
        queueAdminIdLookup(1);

        await changeOwnPassword(7, "password-giusta", "Nuova-password-1!", "token-corrente");

        expect(rm).not.toHaveBeenCalled();
    });
});

describe("ensureDefaultAdmin", () => {
    it("al primo avvio crea l'admin e scrive la password generata in un file leggibile solo dal proprietario", async () => {
        const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

        await ensureDefaultAdmin();

        expect(dbCalls.some((call) => call.op === "insert" && call.table === userTable)).toBe(true);
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/initial-admin-password\.txt$/),
            expect.stringContaining("username: admin"),
            expect.objectContaining({ mode: 0o600 })
        );
        expect(rm).not.toHaveBeenCalled();
        consoleLog.mockRestore();
    });

    it("se l'admin ha già cambiato la password generata, cancella il file rimasto", async () => {
        queueRows("select", userTable, [{ id: 1, mustChangePassword: false }]);

        await ensureDefaultAdmin();

        expect(rm).toHaveBeenCalledWith(expect.stringMatching(/initial-admin-password\.txt$/), { force: true });
        expect(dbCalls.some((call) => call.op === "insert")).toBe(false);
    });

    it("finché la password generata non è stata cambiata, il file resta", async () => {
        queueRows("select", userTable, [{ id: 1, mustChangePassword: true }]);

        await ensureDefaultAdmin();

        expect(rm).not.toHaveBeenCalled();
    });

    it("un errore nel cancellare il file non fa fallire l'avvio", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        rm.mockRejectedValueOnce(new Error("EACCES"));
        queueRows("select", userTable, [{ id: 1, mustChangePassword: false }]);

        await expect(ensureDefaultAdmin()).resolves.toBeUndefined();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

describe("disableTwoFactor", () => {
    beforeEach(() => {
        decryptSecret.mockResolvedValue(totpSecret);
    });

    it("password giusta ma codice sbagliato: conta contro l'utente e non tocca la 2FA", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(disableTwoFactor(7, "password-giusta", wrongTotpCode())).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(registerFailedLogin).toHaveBeenCalledWith(secondFactorKey);
        expect(deleteRecoveryCodes).not.toHaveBeenCalled();
    });

    it("rifiuta con 429 anche un codice giusto quando l'utente ha esaurito i tentativi sul secondo fattore", async () => {
        isLoginRateLimited.mockImplementation((key) => key === secondFactorKey);
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(disableTwoFactor(7, "password-giusta", generateTotpCode(totpSecret))).rejects.toMatchObject({
            statusCode: 429,
        });

        expect(deleteRecoveryCodes).not.toHaveBeenCalled();
    });

    it("con password e codice giusti toglie segreto, conferma, ultimo passo e codici di recupero", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await disableTwoFactor(7, "password-giusta", generateTotpCode(totpSecret));

        const cleared = dbCalls.find((call) => call.op === "update" && call.values?.totpSecret === null);
        expect(cleared?.values).toEqual({ totpSecret: null, totpConfirmedAt: null, totpLastStep: null });
        expect(deleteRecoveryCodes).toHaveBeenCalledWith(7);
    });

    /** Password *e* codice: chi ha rubato solo la sessione non arriva nemmeno a provare codici. */
    it("con la password sbagliata si ferma prima di guardare il codice", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(disableTwoFactor(7, "password-sbagliata", generateTotpCode(totpSecret))).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(decryptSecret).not.toHaveBeenCalled();
        expect(registerFailedLogin).toHaveBeenCalledWith(passwordKey);
        expect(deleteRecoveryCodes).not.toHaveBeenCalled();
    });

    it("rifiuta con 400 quando la 2FA non è attiva", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(disableTwoFactor(7, "password-giusta", "123456")).rejects.toMatchObject({ statusCode: 400 });

        expect(deleteRecoveryCodes).not.toHaveBeenCalled();
    });
});

describe("login: dettagli della verifica della password", () => {
    /** Un hash rovinato nel database (import a mano, colonna troncata) è una password sbagliata, non un 500. */
    it("tratta un hash senza separatore come una password sbagliata", async () => {
        queueRows("select", userTable, [buildUser({ passwordHash: "hash-senza-sale" })]);

        await expect(login("mario", "password-giusta", "1.2.3.4")).rejects.toMatchObject({ statusCode: 401 });

        expect(registerFailedLogin).toHaveBeenCalledWith(accountKey);
    });
});

describe("completeTwoFactorLogin: challenge e account cambiati nel frattempo", () => {
    beforeEach(() => {
        decryptSecret.mockResolvedValue(totpSecret);
    });

    it("un challenge scaduto o mai esistito risponde 410 senza cercare l'utente", async () => {
        getTwoFactorChallengeUserId.mockReturnValue(null);

        await expect(
            completeTwoFactorLogin("challenge-vecchio", generateTotpCode(totpSecret), "1.2.3.4")
        ).rejects.toMatchObject({ statusCode: 410 });

        expect(dbCalls).toHaveLength(0);
    });

    it("un account disattivato mentre il challenge era aperto chiude il challenge con un 410", async () => {
        getTwoFactorChallengeUserId.mockReturnValue(7);
        queueRows("select", userTable, [buildTwoFactorUser({ active: false })]);

        await expect(
            completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "1.2.3.4")
        ).rejects.toMatchObject({ statusCode: 410 });

        expect(deleteTwoFactorChallenge).toHaveBeenCalledWith("challenge-1");
        expect(dbCalls.some((call) => call.op === "insert" && call.table === sessionTable)).toBe(false);
    });

    it("una 2FA tolta da un'altra sessione mentre il challenge era aperto chiude il challenge con un 410", async () => {
        getTwoFactorChallengeUserId.mockReturnValue(7);
        queueRows("select", userTable, [buildUser()]);

        await expect(
            completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "1.2.3.4")
        ).rejects.toMatchObject({ statusCode: 410 });

        expect(deleteTwoFactorChallenge).toHaveBeenCalledWith("challenge-1");
    });

    it("all'ultimo codice sbagliato del challenge risponde 410, non 401", async () => {
        getTwoFactorChallengeUserId.mockReturnValue(7);
        registerFailedTwoFactorAttempt.mockReturnValue(false);
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(completeTwoFactorLogin("challenge-1", wrongTotpCode(), "1.2.3.4")).rejects.toMatchObject({
            statusCode: 410,
        });
    });

    it("salva il passo del codice accettato, così lo stesso codice non entra una seconda volta", async () => {
        getTwoFactorChallengeUserId.mockReturnValue(7);
        const now = Date.now();
        queueRows("select", userTable, [buildTwoFactorUser()]);
        queueAdminIdLookup(1);

        await completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret, now), "1.2.3.4");

        const saved = dbCalls.find((call) => call.op === "update" && call.table === userTable);
        expect(saved?.values?.totpLastStep).toBeGreaterThanOrEqual(stepForTimestamp(now));
        expect(deleteTwoFactorChallenge).toHaveBeenCalledWith("challenge-1");
    });

    it("rifiuta un codice già usato nei suoi trenta secondi", async () => {
        getTwoFactorChallengeUserId.mockReturnValue(7);
        const now = Date.now();
        queueRows("select", userTable, [buildTwoFactorUser({ totpLastStep: stepForTimestamp(now) })]);

        await expect(
            completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret, now), "1.2.3.4")
        ).rejects.toMatchObject({ statusCode: 401 });

        expect(dbCalls.some((call) => call.op === "insert" && call.table === sessionTable)).toBe(false);
    });

    describe("con un codice di recupero", () => {
        beforeEach(() => {
            getTwoFactorChallengeUserId.mockReturnValue(7);
            consumeRecoveryCode.mockResolvedValue(true);
        });

        /** L'accesso arriva senza sessione, quindi il registro delle azioni non lo vede: resta solo questo avviso. */
        it("fa entrare e avvisa, dicendo quanti codici restano", async () => {
            countUnusedRecoveryCodes.mockResolvedValue(3);
            queueRows("select", userTable, [buildTwoFactorUser()]);
            queueAdminIdLookup(1);

            const result = await completeTwoFactorLogin("challenge-1", generateRecoveryCodes()[0], "1.2.3.4");

            expect(result.status).toBe("authenticated");
            expect(recordNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    dedupeKey: "two-factor-recovery-code-used:7",
                    severity: "info",
                    message: expect.stringContaining("Ne restano 3") as unknown,
                })
            );
        });

        it("con l'ultimo codice rimasto l'avviso diventa un'allerta", async () => {
            countUnusedRecoveryCodes.mockResolvedValue(0);
            queueRows("select", userTable, [buildTwoFactorUser()]);
            queueAdminIdLookup(1);

            await completeTwoFactorLogin("challenge-1", generateRecoveryCodes()[0], "1.2.3.4");

            expect(recordNotification).toHaveBeenCalledWith(expect.objectContaining({ severity: "warning" }));
        });

        it("consuma il codice per hash, mai in chiaro", async () => {
            const [code] = generateRecoveryCodes();
            queueRows("select", userTable, [buildTwoFactorUser()]);
            queueAdminIdLookup(1);

            await completeTwoFactorLogin("challenge-1", code, "1.2.3.4");

            expect(consumeRecoveryCode).toHaveBeenCalledWith(7, hashRecoveryCode(code));
        });
    });

    it("con un TOTP giusto non manda nessun avviso", async () => {
        getTwoFactorChallengeUserId.mockReturnValue(7);
        queueRows("select", userTable, [buildTwoFactorUser()]);
        queueAdminIdLookup(1);

        await completeTwoFactorLogin("challenge-1", generateTotpCode(totpSecret), "1.2.3.4");

        expect(recordNotification).not.toHaveBeenCalled();
    });
});

describe("deleteSession e pulizia periodica delle sessioni", () => {
    const sessionDeletes = () => dbCalls.filter((call) => call.op === "delete" && call.table === sessionTable);

    afterEach(() => {
        stopSessionCleanupScheduler();
        vi.useRealTimers();
    });

    it("deleteSession cancella dalla tabella delle sessioni", async () => {
        await deleteSession("token-in-chiaro");

        expect(sessionDeletes()).toHaveLength(1);
    });

    it("pulisce subito all'avvio e poi una volta l'ora; un secondo avvio non raddoppia il timer", async () => {
        vi.useFakeTimers();
        const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
        queueRows("delete", sessionTable, [{ tokenHash: "a" }, { tokenHash: "b" }]);

        startSessionCleanupScheduler();
        startSessionCleanupScheduler();
        await vi.advanceTimersByTimeAsync(0);

        expect(sessionDeletes()).toHaveLength(1);
        expect(consoleLog).toHaveBeenCalledWith("Sessioni scadute rimosse: 2");

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(sessionDeletes()).toHaveLength(2);

        stopSessionCleanupScheduler();
        await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
        expect(sessionDeletes()).toHaveLength(2);
        consoleLog.mockRestore();
    });

    it("non scrive nel log quando non c'era niente da togliere", async () => {
        vi.useFakeTimers();
        const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

        startSessionCleanupScheduler();
        await vi.advanceTimersByTimeAsync(0);

        expect(consoleLog).not.toHaveBeenCalled();
        consoleLog.mockRestore();
    });

    it("un errore del database non ferma le passate successive", async () => {
        vi.useFakeTimers();
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        queueRows("delete", sessionTable, new Error("connessione persa"));

        startSessionCleanupScheduler();
        await vi.advanceTimersByTimeAsync(0);

        expect(consoleError).toHaveBeenCalledWith("Errore pulizia sessioni scadute:", expect.any(Error));

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(sessionDeletes()).toHaveLength(2);
        consoleError.mockRestore();
    });
});

describe("listSessionsForUser / revokeSession", () => {
    it("elenca le sessioni, marcando quella aperta con il token corrente", async () => {
        const currentToken = "token-in-chiaro";
        const currentTokenHash = crypto.createHash("sha256").update(currentToken).digest("hex");

        queueRows("select", userTable, [buildUser({ id: 7 })]);
        queueRows("select", sessionTable, [
            {
                tokenHash: currentTokenHash,
                createdAt: new Date("2026-01-02T00:00:00Z"),
                expiresAt: new Date("2026-01-09T00:00:00Z"),
                lastSeenAt: new Date("2026-01-05T10:00:00Z"),
                userAgent:
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            },
            {
                tokenHash: "altro-hash",
                createdAt: new Date("2026-01-01T00:00:00Z"),
                expiresAt: new Date("2026-01-08T00:00:00Z"),
                lastSeenAt: new Date("2026-01-01T00:10:00Z"),
                // Aperta prima che l'header venisse salvato: fuori esce `device: null`.
                userAgent: null,
            },
        ]);

        const sessions = await listSessionsForUser(7, currentToken);

        expect(sessions).toEqual([
            {
                id: currentTokenHash,
                createdAt: "2026-01-02T00:00:00.000Z",
                expiresAt: "2026-01-09T00:00:00.000Z",
                lastSeenAt: "2026-01-05T10:00:00.000Z",
                device: "Chrome su Windows",
                isCurrent: true,
            },
            {
                id: "altro-hash",
                createdAt: "2026-01-01T00:00:00.000Z",
                expiresAt: "2026-01-08T00:00:00.000Z",
                lastSeenAt: "2026-01-01T00:10:00.000Z",
                device: null,
                isCurrent: false,
            },
        ]);
    });

    it("senza un token corrente nessuna sessione è marcata come tale", async () => {
        queueRows("select", userTable, [buildUser({ id: 7 })]);
        queueRows("select", sessionTable, [
            {
                tokenHash: "hash-uno",
                createdAt: new Date("2026-01-01T00:00:00Z"),
                expiresAt: new Date("2026-01-08T00:00:00Z"),
                lastSeenAt: new Date("2026-01-01T00:00:00Z"),
            },
        ]);

        const sessions = await listSessionsForUser(7);

        expect(sessions[0].isCurrent).toBe(false);
    });

    it("risponde 404 per un utente che non esiste", async () => {
        queueRows("select", userTable, []);

        await expect(listSessionsForUser(99)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("revokeSession cancella la sessione indicata", async () => {
        await revokeSession(7, "hash-uno");

        expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
    });
});

describe("gestione utenti", () => {
    /** Nello stesso formato di `hashPassword`: verifica che l'hash salvato apra con quella password. */
    const hashOpensWith = (storedHash: unknown, password: string) => {
        const [salt, derived] = String(storedHash).split(":");
        return crypto.scryptSync(password, salt, 64).toString("hex") === derived;
    };

    it("listUsers segna come amministratore solo l'id più basso e non espone hash né segreti", async () => {
        const rows = [
            buildUser({ id: 1, username: "admin", totpSecret: "segreto-admin", totpConfirmedAt: new Date() }),
            buildUser({ id: 7, username: "mario", totpSecret: "segreto-mario" }),
        ];
        // Stesse righe per l'elenco e per la ricerca dell'id più basso: le due query partono
        // insieme, e così il risultato non dipende da quale delle due esce per prima.
        queueRows("select", userTable, rows);
        queueRows("select", userTable, rows);

        const users = await listUsers();

        expect(users.map((user) => [user.username, user.isAdmin, user.twoFactorEnabled])).toEqual([
            ["admin", true, true],
            ["mario", false, false],
        ]);
        const serialized = JSON.stringify(users);
        expect(serialized).not.toContain(passwordHash);
        expect(serialized).not.toContain("segreto-");
    });

    it("createUser salva solo l'hash della password generata e ne impone il cambio", async () => {
        queueRows("insert", userTable, [buildUser({ id: 9, username: "anna", mustChangePassword: true })]);
        queueAdminIdLookup(1);

        const result = await createUser("anna");

        const inserted = dbCalls.find((call) => call.op === "insert" && call.table === userTable);
        expect(inserted?.values).toMatchObject({ username: "anna", mustChangePassword: true });
        expect(String(inserted?.values?.passwordHash)).not.toContain(result.generatedPassword);
        expect(hashOpensWith(inserted?.values?.passwordHash, result.generatedPassword)).toBe(true);
        expect(result.user).toMatchObject({ username: "anna", isAdmin: false, mustChangePassword: true });
    });

    describe("regeneratePassword", () => {
        it("sostituisce la password, ne impone il cambio e chiude tutte le sessioni dell'utente", async () => {
            queueRows("select", userTable, [buildUser()]);
            queueAdminIdLookup(1);

            const result = await regeneratePassword(7);

            const updated = dbCalls.find((call) => call.op === "update" && call.table === userTable);
            expect(updated?.values?.mustChangePassword).toBe(true);
            expect(hashOpensWith(updated?.values?.passwordHash, result.generatedPassword)).toBe(true);
            expect(hashOpensWith(updated?.values?.passwordHash, "password-giusta")).toBe(false);
            expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
            expect(result.user.mustChangePassword).toBe(true);
        });

        it("risponde 404 per un utente che non esiste, senza scrivere niente", async () => {
            queueRows("select", userTable, []);

            await expect(regeneratePassword(99)).rejects.toMatchObject({ statusCode: 404 });

            expect(dbCalls.some((call) => call.op !== "select")).toBe(false);
        });
    });

    describe("setUserActive", () => {
        // Una sola query (UPDATE ... RETURNING) invece di SELECT + UPDATE: niente più riga da
        // accodare per una SELECT che non parte più.
        it("disattivare chiude subito le sessioni già aperte", async () => {
            queueRows("update", userTable, [buildUser({ active: false })]);
            queueAdminIdLookup(1);

            const result = await setUserActive(7, false);

            expect(result.active).toBe(false);
            expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
        });

        it("riattivare non tocca le sessioni", async () => {
            queueRows("update", userTable, [buildUser({ active: true })]);
            queueAdminIdLookup(1);

            const result = await setUserActive(7, true);

            expect(result.active).toBe(true);
            expect(dbCalls.some((call) => call.op === "delete")).toBe(false);
        });

        // Con la SELECT tolta, il 404 lo scopre il RETURNING vuoto dell'UPDATE: qui a non
        // succedere è la conseguenza (nessuna sessione toccata), non più "nessun UPDATE".
        it("risponde 404 per un utente che non esiste, senza toccare le sessioni", async () => {
            queueRows("update", userTable, []);

            await expect(setUserActive(99, false)).rejects.toMatchObject({ statusCode: 404 });

            expect(dbCalls.some((call) => call.op === "delete")).toBe(false);
        });
    });

    describe("deleteUser", () => {
        it("cancella l'utente che esiste", async () => {
            queueRows("select", userTable, [{ id: 7 }]);

            await deleteUser(7);

            expect(dbCalls.some((call) => call.op === "delete" && call.table === userTable)).toBe(true);
        });

        it("risponde 404 per un utente che non esiste, senza cancellare niente", async () => {
            queueRows("select", userTable, []);

            await expect(deleteUser(99)).rejects.toMatchObject({ statusCode: 404 });

            expect(dbCalls.some((call) => call.op === "delete")).toBe(false);
        });
    });

    it("changeOwnPassword salva un hash che apre con la nuova password e toglie l'obbligo di cambiarla", async () => {
        queueRows("select", userTable, [buildUser({ mustChangePassword: true })]);

        await changeOwnPassword(7, "password-giusta", "Nuova-password-1!", "token-corrente");

        const updated = dbCalls.find((call) => call.op === "update" && call.table === userTable);
        expect(updated?.values?.mustChangePassword).toBe(false);
        expect(hashOpensWith(updated?.values?.passwordHash, "Nuova-password-1!")).toBe(true);
        expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
    });

    it("changeOwnPassword risponde 404 per un utente che non esiste", async () => {
        queueRows("select", userTable, []);

        await expect(changeOwnPassword(99, "x", "Nuova-password-1!", "token")).rejects.toMatchObject({
            statusCode: 404,
        });
    });

    it("ensureDefaultAdmin non fallisce se non riesce a scrivere il file con la password", async () => {
        const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        mkdir.mockRejectedValueOnce(new Error("EROFS"));

        await expect(ensureDefaultAdmin()).resolves.toBeUndefined();

        expect(dbCalls.some((call) => call.op === "insert" && call.table === userTable)).toBe(true);
        expect(consoleError).toHaveBeenCalled();
        consoleLog.mockRestore();
        consoleError.mockRestore();
    });
});

describe("getTwoFactorStatus", () => {
    it("con la 2FA spenta risponde zero codici senza nemmeno contarli", async () => {
        queueRows("select", userTable, [buildUser()]);

        expect(await getTwoFactorStatus(7)).toEqual({ enabled: false, remainingRecoveryCodes: 0 });
        expect(countUnusedRecoveryCodes).not.toHaveBeenCalled();
    });

    it("con la 2FA attiva conta i codici di recupero rimasti", async () => {
        countUnusedRecoveryCodes.mockResolvedValue(5);
        queueRows("select", userTable, [buildTwoFactorUser()]);

        expect(await getTwoFactorStatus(7)).toEqual({ enabled: true, remainingRecoveryCodes: 5 });
    });

    it("risponde 404 per un utente che non esiste", async () => {
        queueRows("select", userTable, []);

        await expect(getTwoFactorStatus(99)).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe("startTwoFactorSetup", () => {
    it("salva il nuovo segreto cifrato, ancora da confermare, e restituisce QR e URI", async () => {
        queueRows("select", userTable, [buildUser()]);

        const setup = await startTwoFactorSetup(7, "password-giusta");

        const saved = dbCalls.find((call) => call.op === "update" && call.table === userTable);
        expect(saved?.values).toEqual({
            totpSecret: `cifrato:${setup.secretBase32}`,
            totpConfirmedAt: null,
            totpLastStep: null,
        });
        expect(setup.otpauthUri).toContain(`secret=${setup.secretBase32}`);
        expect(setup.otpauthUri).toContain("issuer=Laboratorio");
        expect(setup.otpauthUri).toContain("mario");
        expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("con la password sbagliata non genera niente e conta il tentativo contro l'utente", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(startTwoFactorSetup(7, "password-sbagliata")).rejects.toMatchObject({ statusCode: 400 });

        expect(registerFailedLogin).toHaveBeenCalledWith(passwordKey);
        expect(dbCalls.some((call) => call.op === "update")).toBe(false);
    });

    /**
     * Il buco che questo test chiude: senza il controllo, la sola password rubata basterebbe
     * a sostituire il secondo fattore di un altro con uno proprio.
     */
    it("con la 2FA già attiva rifiuta anche con la password giusta, senza toccare il segreto", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(startTwoFactorSetup(7, "password-giusta")).rejects.toMatchObject({ statusCode: 400 });

        expect(dbCalls.some((call) => call.op === "update")).toBe(false);
    });
});

describe("confirmTwoFactorSetup", () => {
    const pendingSetupUser = () => buildUser({ totpSecret: "cifrato", totpConfirmedAt: null });

    beforeEach(() => {
        decryptSecret.mockResolvedValue(totpSecret);
    });

    it("con il codice dell'app attiva la 2FA, salva solo gli hash dei codici di recupero e chiude le altre sessioni", async () => {
        queueRows("select", userTable, [pendingSetupUser()]);

        const { recoveryCodes } = await confirmTwoFactorSetup(7, generateTotpCode(totpSecret), "token-corrente");

        expect(recoveryCodes).toHaveLength(8);
        expect(recoveryCodes.every(looksLikeRecoveryCode)).toBe(true);
        expect(replaceRecoveryCodes).toHaveBeenCalledWith(7, recoveryCodes.map(hashRecoveryCode));
        const stored = JSON.stringify(replaceRecoveryCodes.mock.calls);
        expect(recoveryCodes.some((code) => stored.includes(code))).toBe(false);

        const confirmed = dbCalls.find((call) => call.op === "update" && call.table === userTable);
        expect(confirmed?.values?.totpConfirmedAt).toBeInstanceOf(Date);
        expect(typeof confirmed?.values?.totpLastStep).toBe("number");
        expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
    });

    it("con un codice sbagliato non attiva niente", async () => {
        queueRows("select", userTable, [pendingSetupUser()]);

        await expect(confirmTwoFactorSetup(7, wrongTotpCode(), "token-corrente")).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(replaceRecoveryCodes).not.toHaveBeenCalled();
        expect(dbCalls.some((call) => call.op === "update")).toBe(false);
    });

    /** Solo un TOTP prova che l'app ha davvero acquisito il segreto. */
    it("non accetta un codice di recupero come conferma", async () => {
        queueRows("select", userTable, [pendingSetupUser()]);

        await expect(confirmTwoFactorSetup(7, generateRecoveryCodes()[0], "token-corrente")).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(consumeRecoveryCode).not.toHaveBeenCalled();
        expect(replaceRecoveryCodes).not.toHaveBeenCalled();
    });

    it("senza una configurazione avviata chiede di ricominciare", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(confirmTwoFactorSetup(7, "123456", "token-corrente")).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining("Nessuna configurazione") as unknown,
        });
    });

    /** Un segreto mai confermato non protegge niente: basta ricominciare, senza allarmi. */
    it("con il segreto in attesa non più leggibile chiede di ricominciare, senza avvisi", async () => {
        decryptSecret.mockRejectedValue(new Error("chiave diversa"));
        queueRows("select", userTable, [pendingSetupUser()]);

        await expect(confirmTwoFactorSetup(7, "123456", "token-corrente")).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining("Nessuna configurazione") as unknown,
        });

        expect(recordNotification).not.toHaveBeenCalled();
    });

    it("con la 2FA già attiva rifiuta", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(confirmTwoFactorSetup(7, generateTotpCode(totpSecret), "token-corrente")).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(replaceRecoveryCodes).not.toHaveBeenCalled();
    });
});

describe("regenerateRecoveryCodes", () => {
    beforeEach(() => {
        decryptSecret.mockResolvedValue(totpSecret);
    });

    it("con password e codice giusti sostituisce i codici e restituisce i nuovi in chiaro una volta sola", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        const { recoveryCodes } = await regenerateRecoveryCodes(7, "password-giusta", generateTotpCode(totpSecret));

        expect(recoveryCodes).toHaveLength(8);
        expect(replaceRecoveryCodes).toHaveBeenCalledWith(7, recoveryCodes.map(hashRecoveryCode));
    });

    it("con il codice sbagliato lascia i codici di prima", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);

        await expect(regenerateRecoveryCodes(7, "password-giusta", wrongTotpCode())).rejects.toMatchObject({
            statusCode: 400,
        });

        expect(replaceRecoveryCodes).not.toHaveBeenCalled();
    });
});

describe("adminDisableTwoFactor", () => {
    it("toglie la 2FA e chiude tutte le sessioni dell'utente, che non sono più fidate", async () => {
        queueRows("select", userTable, [buildTwoFactorUser()]);
        queueAdminIdLookup(1);

        const user = await adminDisableTwoFactor(7);

        expect(user.twoFactorEnabled).toBe(false);
        expect(deleteRecoveryCodes).toHaveBeenCalledWith(7);
        expect(dbCalls.find((call) => call.op === "update" && call.table === userTable)?.values).toEqual({
            totpSecret: null,
            totpConfirmedAt: null,
            totpLastStep: null,
        });
        expect(dbCalls.some((call) => call.op === "delete" && call.table === sessionTable)).toBe(true);
    });

    it("risponde 404 per un utente che non esiste, senza toccare niente", async () => {
        queueRows("select", userTable, []);

        await expect(adminDisableTwoFactor(99)).rejects.toMatchObject({ statusCode: 404 });

        expect(deleteRecoveryCodes).not.toHaveBeenCalled();
    });
});

describe("assertOwnPassword", () => {
    it("con la password giusta passa e azzera il contatore dell'utente", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(assertOwnPassword(7, "password-giusta")).resolves.toBeUndefined();

        expect(registerSuccessfulLogin).toHaveBeenCalledWith(passwordKey);
    });

    it("con la password sbagliata risponde 400 e conta il tentativo", async () => {
        queueRows("select", userTable, [buildUser()]);

        await expect(assertOwnPassword(7, "password-sbagliata")).rejects.toMatchObject({ statusCode: 400 });

        expect(registerFailedLogin).toHaveBeenCalledWith(passwordKey);
    });

    it("a tentativi esauriti risponde 429 anche con la password giusta", async () => {
        isLoginRateLimited.mockImplementation((key) => key === passwordKey);
        queueRows("select", userTable, [buildUser()]);

        await expect(assertOwnPassword(7, "password-giusta")).rejects.toMatchObject({ statusCode: 429 });
    });
});
