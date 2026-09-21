-- La ricerca clienti confronta il testo con ILIKE, che ignora maiuscole/minuscole ma non gli
-- accenti: "Nicolo" non trovava "Nicolò". `unaccent()` risolverebbe il problema ma è marcata
-- STABLE in Postgres, non IMMUTABLE, quindi non è utilizzabile dentro l'espressione di un indice
-- (Postgres rifiuta la CREATE INDEX con "functions in index expression must be marked IMMUTABLE").
-- Il rimedio standard: un wrapper SQL immutabile attorno a `unaccent`, usato sia negli indici sia
-- nella query. La forma a due argomenti (`unaccent('unaccent', $1)`) evita che il risultato
-- dipenda dal `search_path` di chi esegue la query, a differenza della forma a un argomento che
-- risolve il dizionario `unaccent` cercandolo negli schemi di `search_path`.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_first_name_unaccent_trgm_idx" ON "customer" USING gin (immutable_unaccent("first_name") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_last_name_unaccent_trgm_idx" ON "customer" USING gin (immutable_unaccent("last_name") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_city_unaccent_trgm_idx" ON "customer" USING gin (immutable_unaccent("city") gin_trgm_ops);
