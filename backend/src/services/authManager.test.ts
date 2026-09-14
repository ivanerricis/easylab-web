import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const queueRows = (op: DbCall["op"], table: unknown, rows: unknown[]) => {
    const key = queueKey(op, table);
    const existing = queuedRows.get(key) ?? [];
    existing.push(rows);
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

vi.mock("./twoFactorChallenge", () => ({
    createTwoFactorChallenge: (userId: number) => createTwoFactorChallenge(userId) as string,
    deleteTwoFactorChallenge: vi.fn(),
    getTwoFactorChallengeUserId: (challengeId: string) => getTwoFactorChallengeUserId(challengeId) as number | null,
    registerFailedTwoFactorAttempt: (challengeId: string) => registerFailedTwoFactorAttempt(challengeId) as boolean,
}));

const deleteRecoveryCodes = vi.fn();
const consumeRecoveryCode = vi.fn<(userId: number, codeHash: string) => Promise<boolean>>(() => Promise.resolve(false));

vi.mock("../db/queries/recoveryCode", () => ({
    consumeRecoveryCode: (userId: number, codeHash: string) => consumeRecoveryCode(userId, codeHash),
    countUnusedRecoveryCodes: vi.fn(() => Promise.resolve(0)),
    deleteRecoveryCodes: (userId: number) => deleteRecoveryCodes(userId),
    replaceRecoveryCodes: vi.fn(),
}));

const recordNotification = vi.fn();

vi.mock("./notificationManager", () => ({
    recordNotification: (input: unknown) => recordNotification(input),
}));

vi.mock("./companyManager", () => ({
    getCompanySettings: vi.fn(() => Promise.resolve({ name: "Laboratorio" })),
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
    changeOwnPassword,
    clearUnreadableTwoFactorSecrets,
    completeTwoFactorLogin,
    disableTwoFactor,
    ensureDefaultAdmin,
    getSessionUser,
    login,
} from "./authManager";
import { generateRecoveryCodes } from "./recoveryCodes";
import { generateTotpCode } from "./totp";

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

beforeEach(() => {
    dbCalls.length = 0;
    queuedRows.clear();
    vi.clearAllMocks();
    isLoginRateLimited.mockReturnValue(false);
    isIpLoginRateLimited.mockReturnValue(false);
    isUsernameLoginRateLimited.mockReturnValue(false);
    isKnownLoginSource.mockReturnValue(false);
    consumeRecoveryCode.mockResolvedValue(false);
    createTwoFactorChallenge.mockReturnValue("challenge-1");
    getTwoFactorChallengeUserId.mockReturnValue(null);
    registerFailedTwoFactorAttempt.mockReturnValue(true);
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
        id: 7,
        username: "mario",
        created_at: new Date("2026-01-01T00:00:00Z"),
        mustChangePassword: false,
        active: true,
        totpConfirmedAt: null,
        ...overrides,
    });

    it("restituisce l'utente della sessione valida", async () => {
        queueRows("select", sessionTable, [sessionRow()]);
        queueAdminIdLookup(1);

        const user = await getSessionUser("token-in-chiaro");

        expect(user).toMatchObject({ id: 7, username: "mario", isAdmin: false });
        expect(dbCalls.some((call) => call.op === "delete")).toBe(false);
    });

    it("smette di imporre la configurazione all'admin appena la 2FA è attiva", async () => {
        queueRows("select", sessionTable, [sessionRow({ totpConfirmedAt: new Date("2026-02-01T00:00:00Z") })]);
        queueAdminIdLookup(7);

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
});
