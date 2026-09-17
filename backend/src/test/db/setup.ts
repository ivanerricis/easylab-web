import { afterAll, beforeAll, beforeEach } from "vitest";
import { pool } from "../../db";

let tablesToTruncate = "";

beforeAll(async () => {
    // Secondo controllo, sul database a cui il pool è davvero collegato: il primo guarda solo
    // l'indirizzo in configurazione.
    const { rows } = await pool.query<{ name: string }>("select current_database() as name");

    if (!rows[0]?.name.endsWith("_test")) {
        throw new Error(`Test sul database: collegato a "${rows[0]?.name}", che non è un database di test.`);
    }

    // Le tabelle dell'app stanno in `public`; il registro delle migrazioni sta nello schema
    // `drizzle` e resta intatto.
    const tables = await pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' order by tablename"
    );
    tablesToTruncate = tables.rows.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
});

// Ogni test parte da tabelle vuote e contatori degli id da 1.
beforeEach(async () => {
    await pool.query(`TRUNCATE ${tablesToTruncate} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
    await pool.end();
});
