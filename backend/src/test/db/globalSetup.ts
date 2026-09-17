import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node" with { "resolution-mode": "import" };

const migrationsFolder = path.resolve(__dirname, "..", "..", "..", "drizzle");

/**
 * Una volta per esecuzione: ricrea da zero il database di test e ci applica le migrazioni di
 * `drizzle/` con lo stesso migrator della produzione (`migrate.js`). Ricrearlo, invece di
 * migrare quello rimasto dalla volta prima, garantisce che lo schema sia esattamente quello
 * delle migrazioni, anche dopo aver provato a mano una migrazione poi cambiata.
 */
export default async function setup(project: TestProject) {
    const url = project.config.env.DATABASE_URL;

    if (!url) {
        throw new Error("Test sul database: DATABASE_URL non impostata (vedi vitest.db.config.mts).");
    }

    const name = decodeURIComponent(new URL(url).pathname.slice(1));

    // Ogni test svuota le tabelle, e qui il database viene eliminato: un indirizzo sbagliato
    // (quello di sviluppo, o peggio) deve fermarsi prima di collegarsi. Il nome finisce anche
    // nell'SQL qui sotto, quindi solo caratteri che non vanno mai quotati.
    if (!/^[a-z0-9_]+_test$/.test(name)) {
        throw new Error(
            `Test sul database: "${name}" non è un database di test. Il nome deve finire con "_test" ` +
                "(solo minuscole, cifre e _), perché i test lo eliminano e ne svuotano le tabelle."
        );
    }

    // Il database di manutenzione `postgres` esiste sempre: da lì si può eliminare quello di test.
    const maintenanceUrl = new URL(url);
    maintenanceUrl.pathname = "/postgres";
    const maintenance = new Pool({ connectionString: maintenanceUrl.toString() });

    try {
        await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await maintenance.query(`CREATE DATABASE "${name}"`);
    } catch (error) {
        throw new Error(
            `Test sul database: impossibile preparare "${name}" (${(error as Error).message}). ` +
                "In locale serve lo stack di sviluppo acceso: docker compose -f docker-compose.dev.yml up -d",
            { cause: error }
        );
    } finally {
        await maintenance.end();
    }

    const pool = new Pool({ connectionString: url });

    try {
        await migrate(drizzle(pool), { migrationsFolder });
    } finally {
        await pool.end();
    }
}
