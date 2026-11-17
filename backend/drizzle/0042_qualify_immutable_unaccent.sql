-- `immutable_unaccent` (0034) chiamava `unaccent` senza schema. Funziona finché `search_path`
-- contiene `public`, ma i dump di pg_dump lo svuotano in testa, e il ripristino si fermava
-- ricreando gli indici della ricerca clienti: "function unaccent(unknown, text) does not exist".
-- Con funzione e dizionario qualificati il risultato non dipende più da `search_path`. Niente
-- `SET search_path` sulla funzione: impedirebbe a Postgres di espanderla dentro le query, e gli
-- indici non verrebbero più usati. Il risultato non cambia, quindi gli indici restano validi.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
