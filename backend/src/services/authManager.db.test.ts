import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { sessionTable, userDeviceTable, userTable } from "../db/schema";
import { insertSession, insertUser } from "../test/db/fixtures";
import { deleteSession, getSessionUser, listSessionsForUser, login, setDeviceName } from "./authManager";
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

describe("nome del dispositivo: con un database vero", () => {
    const password = "Password-Giusta-1!";
    const deviceId = "c".repeat(32);

    const loginAs = async (username: string, device: string | null) => {
        const result = await login(username, password, freshIp(), "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0", device);

        if (result.status !== "authenticated") {
            throw new Error("atteso un accesso riuscito");
        }

        return result.token;
    };

    it("il login salva solo l'hash dell'identità del dispositivo, mai l'identità", async () => {
        const user = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });

        await loginAs("mario", deviceId);

        const [row] = await db.select().from(sessionTable).where(eq(sessionTable.userId, user.id));
        expect(row.deviceHash).toBe(tokenHashOf(deviceId));
        expect(JSON.stringify(row)).not.toContain(deviceId);
    });

    it("il nome resta al dispositivo fra un accesso e il successivo", async () => {
        const user = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });

        const firstToken = await loginAs("mario", deviceId);
        await setDeviceName(user.id, firstToken, "Portatile del banco");
        await deleteSession(firstToken);

        const secondToken = await loginAs("mario", deviceId);
        const sessions = await listSessionsForUser(user.id, secondToken);

        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({ deviceName: "Portatile del banco", isCurrent: true });
    });

    it("due dispositivi uguali si distinguono dal nome, e uno senza nome resta null", async () => {
        const user = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });

        const bancoToken = await loginAs("mario", deviceId);
        await setDeviceName(user.id, bancoToken, "Banco");
        await loginAs("mario", "d".repeat(32));

        const sessions = await listSessionsForUser(user.id, bancoToken);

        expect(sessions.map((session) => session.deviceName)).toHaveLength(2);
        expect(sessions.map((session) => session.deviceName)).toContain("Banco");
        expect(sessions.map((session) => session.deviceName)).toContain(null);
        expect(sessions.every((session) => session.device === "Chrome su Windows")).toBe(true);
    });

    it("rinominare sostituisce il nome, e null lo toglie cancellando la riga", async () => {
        const user = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });
        const token = await loginAs("mario", deviceId);

        await setDeviceName(user.id, token, "Banco");
        await setDeviceName(user.id, token, "Laboratorio");
        expect((await db.select().from(userDeviceTable)).map((row) => row.name)).toEqual(["Laboratorio"]);

        await setDeviceName(user.id, token, null);
        expect(await db.select().from(userDeviceTable)).toEqual([]);
    });

    it("lo stesso dispositivo usato da due utenti tiene un nome per ciascuno", async () => {
        const mario = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });
        const luca = await insertUser({ username: "luca", passwordHash: hashLikeTheAppDoes(password) });

        await setDeviceName(mario.id, await loginAs("mario", deviceId), "Di Mario");
        await setDeviceName(luca.id, await loginAs("luca", deviceId), "Di Luca");

        const names = await db.select().from(userDeviceTable);
        expect(names.map((row) => row.name).sort()).toEqual(["Di Luca", "Di Mario"]);
    });

    it("una sessione senza identità di dispositivo risponde 409 e non scrive niente", async () => {
        const user = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });
        const token = await loginAs("mario", null);

        await expect(setDeviceName(user.id, token, "Banco")).rejects.toMatchObject({ statusCode: 409 });
        expect(await db.select().from(userDeviceTable)).toEqual([]);
    });

    it("togliere l'utente toglie anche i nomi dei suoi dispositivi", async () => {
        const user = await insertUser({ username: "mario", passwordHash: hashLikeTheAppDoes(password) });
        await setDeviceName(user.id, await loginAs("mario", deviceId), "Banco");

        await db.delete(userTable).where(eq(userTable.id, user.id));

        expect(await db.select().from(userDeviceTable)).toEqual([]);
    });
});
