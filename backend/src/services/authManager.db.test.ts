import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { sessionTable } from "../db/schema";
import { insertSession, insertUser } from "../test/db/fixtures";
import { deleteSession, getSessionUser, login } from "./authManager";
import { resetLoginRateLimit } from "./loginRateLimit";

/**
 * `authManager.test.ts` fissa le decisioni prese *intorno* alle query con un `db` finto: utile
 * per il limitatore, per la 2FA, per tutto quello che non dipende da cosa fa davvero Postgres.
 * Ma due cose lì restano non verificate perché il mock le aggira del tutto:
 *
 * - `getSessionUser` calcola "chi è amministratore" con una sottoquery SQL
 *   (`id = (select min(id) from "user")`), e il test finto si limita a mettere in coda un
 *   valore già pronto per `isAdmin`: non fa mai girare quella sottoquery;
 * - la sessione creata da `login` e letta da `getSessionUser`/tolta da `deleteSession` è una
 *   riga vera, con il proprio vincolo di scadenza e la propria unicità sul token hash.
 *
 * Qui gira tutto contro il database di test, senza mock del layer dati: solo il limitatore dei
 * tentativi (memoria di processo, condivisa fra i file di questa suite) va azzerato a ogni test.
 */
const hashLikeTheAppDoes = (password: string) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
};

const tokenHashOf = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

let nextIp = 1;
/** Un indirizzo diverso per test, per non far scattare il limitatore fra un test e l'altro. */
const freshIp = () => `10.0.0.${nextIp++}`;

beforeEach(() => {
    resetLoginRateLimit();
});

describe("login: con un database vero", () => {
    it("crea una riga di sessione vera, con l'hash del token e mai il token in chiaro", async () => {
        const password = "Password-Giusta-1!";
        const user = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });

        const result = await login("mario", password, freshIp());

        if (result.status !== "authenticated") {
            throw new Error("atteso un accesso riuscito");
        }

        const rows = await db.select().from(sessionTable).where(eq(sessionTable.userId, user.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].tokenHash).toBe(tokenHashOf(result.token));
        expect(JSON.stringify(rows[0])).not.toContain(result.token);
    });

    it("con la password sbagliata non crea nessuna sessione", async () => {
        await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes("Password-Giusta-1!") });

        await expect(login("mario", "sbagliata", freshIp())).rejects.toMatchObject({ statusCode: 401 });

        expect(await db.select().from(sessionTable)).toEqual([]);
    });
});

describe("getSessionUser: con un database vero", () => {
    /**
     * Il buco che un `db` finto non può vedere: `isAdmin` lì è un valore messo in coda dal
     * test, non il risultato della sottoquery `min(id)`. Qui invece sono due utenti veri, e a
     * essere amministratore deve essere solo quello con l'id più basso.
     */
    it("calcola l'amministratore con la sottoquery sul database, non con un campo qualsiasi", async () => {
        const admin = await insertUser();
        const other = await insertUser();
        const adminToken = "token-amministratore";
        const otherToken = "token-altro-utente";
        await insertSession({ userId: admin.id, tokenHash: tokenHashOf(adminToken) });
        await insertSession({ userId: other.id, tokenHash: tokenHashOf(otherToken) });

        expect((await getSessionUser(adminToken))?.isAdmin).toBe(true);
        expect((await getSessionUser(otherToken))?.isAdmin).toBe(false);
    });

    it("una sessione scaduta non restituisce l'utente e la riga viene rimossa", async () => {
        const user = await insertUser();
        const token = "token-scaduto";
        await insertSession({
            userId: user.id,
            tokenHash: tokenHashOf(token),
            expiresAt: new Date(Date.now() - 1000),
        });

        const result = await getSessionUser(token);

        expect(result).toBeNull();
        expect(
            await db
                .select()
                .from(sessionTable)
                .where(eq(sessionTable.tokenHash, tokenHashOf(token)))
        ).toEqual([]);
    });

    it("un utente disattivato non restituisce l'utente e la sessione viene rimossa", async () => {
        const user = await insertUser({ active: false });
        const token = "token-utente-disattivato";
        await insertSession({ userId: user.id, tokenHash: tokenHashOf(token) });

        const result = await getSessionUser(token);

        expect(result).toBeNull();
        expect(await db.select().from(sessionTable)).toEqual([]);
    });

    it("un token mai emesso non restituisce nessun utente e non tocca la tabella", async () => {
        const result = await getSessionUser("token-mai-emesso");

        expect(result).toBeNull();
    });

    it("aggiorna l'ultimo utilizzo quando è passato abbastanza tempo dall'ultima volta", async () => {
        const user = await insertUser();
        const token = "token-inattivo-da-un-po";
        const oldLastSeen = new Date(Date.now() - 10 * 60 * 1000);
        await insertSession({ userId: user.id, tokenHash: tokenHashOf(token), lastSeenAt: oldLastSeen });

        await getSessionUser(token);

        const [row] = await db
            .select()
            .from(sessionTable)
            .where(eq(sessionTable.tokenHash, tokenHashOf(token)));
        expect(row.lastSeenAt.getTime()).toBeGreaterThan(oldLastSeen.getTime());
    });

    it("non riscrive l'ultimo utilizzo appena aggiornato", async () => {
        const user = await insertUser();
        const token = "token-appena-usato";
        const recentLastSeen = new Date(Date.now() - 1000);
        await insertSession({ userId: user.id, tokenHash: tokenHashOf(token), lastSeenAt: recentLastSeen });

        await getSessionUser(token);

        const [row] = await db
            .select()
            .from(sessionTable)
            .where(eq(sessionTable.tokenHash, tokenHashOf(token)));
        expect(row.lastSeenAt.getTime()).toBe(recentLastSeen.getTime());
    });
});

describe("deleteSession: con un database vero", () => {
    it("rimuove solo la sessione con quel token, lasciando le altre dell'utente", async () => {
        const user = await insertUser();
        const keepToken = "token-da-tenere";
        const removeToken = "token-da-togliere";
        await insertSession({ userId: user.id, tokenHash: tokenHashOf(keepToken) });
        await insertSession({ userId: user.id, tokenHash: tokenHashOf(removeToken) });

        await deleteSession(removeToken);

        const remaining = await db.select({ tokenHash: sessionTable.tokenHash }).from(sessionTable);
        expect(remaining).toEqual([{ tokenHash: tokenHashOf(keepToken) }]);
    });

    it("su un token mai emesso non fa niente e non fallisce", async () => {
        const user = await insertUser();
        await insertSession({ userId: user.id, tokenHash: tokenHashOf("token-esistente") });

        await expect(deleteSession("token-mai-emesso")).resolves.not.toThrow();

        expect(await db.select().from(sessionTable)).toHaveLength(1);
    });
});
