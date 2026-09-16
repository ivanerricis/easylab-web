-- L'elenco delle sessioni mostrava solo apertura e scadenza: una sessione aperta giorni fa
-- su un browser mai più riaperto risultava "attiva" come quella in uso. Con l'ultimo utilizzo
-- la differenza si vede, e si sa quale disconnettere.
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp;
--> statement-breakpoint
-- Per le righe già esistenti non c'è storico: si parte dalla data di apertura, il dato più
-- prudente perché non è mai più recente dell'ultimo uso reale.
UPDATE "session" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "last_seen_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "last_seen_at" SET NOT NULL;
