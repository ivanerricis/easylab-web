import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

/**
 * I test che eseguono l'SQL su un Postgres vero (`npm run test:db`). Istruzioni nel README, "Test e controlli".
 *
 * L'indirizzo arriva al codice come `DATABASE_URL`: il pool dell'app (`src/db/index.ts`) lo legge
 * all'import, senza bisogno di cambiarlo.
 *
 * `TEST_DATABASE_URL` ha la precedenza (la usa la CI). Altrimenti si ricava dal `.env` della
 * radice, lo stesso del compose di sviluppo: stesse credenziali, porta pubblicata 5433, e il nome
 * del database di sviluppo più `_test`. È un altro database nello stesso container: quello di
 * sviluppo non viene toccato.
 */
const resolveTestDatabaseUrl = (): string => {
    if (process.env.TEST_DATABASE_URL) {
        return process.env.TEST_DATABASE_URL;
    }

    const envFile = fileURLToPath(new URL("../.env", import.meta.url));

    if (!fs.existsSync(envFile)) {
        throw new Error(
            `Test sul database: manca ${envFile}. Imposta TEST_DATABASE_URL, per esempio ` +
                "postgres://utente:password@localhost:5433/masso_db_test"
        );
    }

    const {
        POSTGRES_USER: user,
        POSTGRES_PASSWORD: password,
        POSTGRES_DB: database,
    } = dotenv.parse(fs.readFileSync(envFile));

    if (!user || !password || !database) {
        throw new Error("Test sul database: POSTGRES_USER, POSTGRES_PASSWORD o POSTGRES_DB mancano nel .env");
    }

    const url = new URL("postgres://localhost:5433");
    url.username = user;
    url.password = password;
    url.pathname = `/${database}_test`;
    return url.toString();
};

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.db.test.ts"],
        globals: false,
        env: { DATABASE_URL: resolveTestDatabaseUrl() },
        // Controlla il nome del database, lo ricrea e applica le migrazioni.
        globalSetup: ["src/test/db/globalSetup.ts"],
        // Svuota le tabelle prima di ogni test.
        setupFiles: ["src/test/db/setup.ts"],
        // Un solo database per tutti: i file girano uno alla volta, altrimenti le TRUNCATE
        // di uno cancellerebbero i dati di un altro a metà test.
        fileParallelism: false,
    },
});
