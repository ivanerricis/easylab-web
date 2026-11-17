-- Il noleggio ha un periodo di fatturazione: ogni quanti mesi si fattura, da 1 a 120 (3, 6, 12 e 24
-- restano le scorciatoie dell'interfaccia, ma si può scrivere anche un altro numero). Sta su
-- `contract` e non in una tabella a parte perché è una sola colonna: il vincolo dice che c'è se e
-- solo se il contratto è un noleggio. I noleggi esistenti partono da 3 mesi.
ALTER TABLE "contract" ADD COLUMN "billing_months" integer;--> statement-breakpoint
UPDATE "contract" SET "billing_months" = 3 WHERE "type" = 'rental';--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_billing_months_check" CHECK (("contract"."type" = 'rental') = ("contract"."billing_months" IS NOT NULL) AND ("contract"."billing_months" IS NULL OR "contract"."billing_months" BETWEEN 1 AND 120));
