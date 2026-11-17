import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { insertCustomer } from "../test/db/fixtures";
import { pool } from "./index";

/**
 * `immutable_unaccent` deve funzionare anche con il `search_path` vuoto che pg_dump imposta in
 * testa ai backup: prima della 0042 il ripristino si fermava ricreando gli indici della ricerca
 * clienti, perché la funzione non trovava `unaccent`.
 */
const withEmptySearchPath = async (run: (client: PoolClient) => Promise<void>) => {
    const client = await pool.connect();

    try {
        await client.query("SELECT pg_catalog.set_config('search_path', '', false)");
        await run(client);
    } finally {
        await client.query("RESET search_path");
        client.release();
    }
};

describe("immutable_unaccent", () => {
    it("toglie gli accenti anche con il search_path vuoto dei backup", async () => {
        await withEmptySearchPath(async (client) => {
            const { rows } = await client.query<{ value: string }>(
                "SELECT public.immutable_unaccent('Nicolò Città') AS value"
            );

            expect(rows[0].value).toBe("Nicolo Citta");
        });
    });

    it("con il search_path vuoto si ricrea l'indice della ricerca clienti, come fa il ripristino", async () => {
        // Con la tabella vuota l'indice non calcolerebbe la funzione su niente.
        await insertCustomer({ firstName: "Nicolò" });

        await withEmptySearchPath(async (client) => {
            await client.query("REINDEX INDEX public.customer_first_name_unaccent_trgm_idx");
        });
    });
});
