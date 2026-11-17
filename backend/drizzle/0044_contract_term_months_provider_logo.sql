-- La durata del contratto diventa un numero libero di mesi (da 1 a 120) al posto dei tre termini
-- fissi (3, 6, 12 mesi): 3, 6, 12 e 24 restano le scorciatoie dell'interfaccia, ma si può
-- scrivere anche, per esempio, 18. I contratti esistenti passano al numero equivalente.
ALTER TABLE "contract" ADD COLUMN "term_months" integer;--> statement-breakpoint
UPDATE "contract" SET "term_months" = CASE "term" WHEN 'months_3' THEN 3 WHEN 'months_6' THEN 6 ELSE 12 END;--> statement-breakpoint
ALTER TABLE "contract" ALTER COLUMN "term_months" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_term_months_check" CHECK ("contract"."term_months" BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE "contract" DROP CONSTRAINT "contract_term_check";--> statement-breakpoint
ALTER TABLE "contract" DROP COLUMN "term";--> statement-breakpoint
-- Il logo del fornitore, per i PDF dei contratti: data URL di un PNG o JPEG ridotto dal browser.
-- NULL per i fornitori creati prima (il PDF allora lo omette); alla creazione lo chiede la rotta.
ALTER TABLE "provider" ADD COLUMN "logo_data_url" text;
