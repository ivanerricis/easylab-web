-- Il listino dei pacchetti di assistenza cambia: sette pacchetti con chiave propria (Assistenza
-- Remota 20/40, Pronti Via 20/40/60 con ore al mese; Supporto Base e Plus con ore su tutto il
-- contratto di 12 mesi), nome, ore e prezzo nel listino `services/assistancePackages.ts`. Qui la
-- colonna `assistance_type` diventa `package`, le ore sono sempre presenti (niente più tempo pieno
-- illimitato) e arriva il prezzo IVA esclusa in centesimi.
--
-- Ore e prezzo sono una COPIA (snapshot) del listino, scritta dal server alla creazione e a ogni
-- cambio di pacchetto. Per questo NON c'è un CHECK che leghi le ore al pacchetto, come c'era
-- prima: un listino futuro non deve rendere invalidi i contratti già firmati. La corrispondenza
-- pacchetto/ore/prezzo la fa rispettare la rotta.
ALTER TABLE "assistance" DROP CONSTRAINT "assistance_package_check";--> statement-breakpoint
ALTER TABLE "assistance" RENAME COLUMN "assistance_type" TO "package";--> statement-breakpoint
ALTER TABLE "assistance" ADD COLUMN "price_cents" integer;--> statement-breakpoint
-- Per i database di sviluppo: i vecchi tipi diventano il pacchetto più vicino, con ore e prezzo
-- del nuovo listino (i contratti non sono ancora in produzione).
UPDATE "assistance" SET "package" = CASE "package"
	WHEN 'remote' THEN 'remote_20'
	WHEN 'on_site' THEN 'ready_20'
	WHEN 'complete' THEN 'ready_60'
	WHEN 'full_time' THEN 'support_plus'
	ELSE "package" END;--> statement-breakpoint
UPDATE "assistance" SET
	"included_hours" = CASE "package"
		WHEN 'remote_20' THEN 20
		WHEN 'remote_40' THEN 40
		WHEN 'ready_20' THEN 20
		WHEN 'ready_40' THEN 40
		WHEN 'ready_60' THEN 60
		WHEN 'support_base' THEN 80
		WHEN 'support_plus' THEN 150 END,
	"price_cents" = CASE "package"
		WHEN 'remote_20' THEN 40000
		WHEN 'remote_40' THEN 72000
		WHEN 'ready_20' THEN 50000
		WHEN 'ready_40' THEN 90000
		WHEN 'ready_60' THEN 123000
		WHEN 'support_base' THEN 160000
		WHEN 'support_plus' THEN 250000 END;--> statement-breakpoint
-- I Supporto durano sempre 12 mesi (la rotta lo impone): i contratti convertiti dal tempo pieno
-- vengono portati a 12 mesi, così restano coerenti.
UPDATE "contract" SET "term_months" = 12
	WHERE "id" IN (SELECT "contract_id" FROM "assistance" WHERE "package" IN ('support_base', 'support_plus'));--> statement-breakpoint
-- Gli avvisi già inviati si riferiscono a soglie del vecchio listino.
DELETE FROM "assistance_hours_alert";--> statement-breakpoint
ALTER TABLE "assistance" ALTER COLUMN "included_hours" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assistance" ALTER COLUMN "price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assistance" ADD CONSTRAINT "assistance_package_check" CHECK ("assistance"."package" IN ('remote_20', 'remote_40', 'ready_20', 'ready_40', 'ready_60', 'support_base', 'support_plus'));--> statement-breakpoint
ALTER TABLE "assistance" ADD CONSTRAINT "assistance_included_hours_check" CHECK ("assistance"."included_hours" > 0);--> statement-breakpoint
ALTER TABLE "assistance" ADD CONSTRAINT "assistance_price_cents_check" CHECK ("assistance"."price_cents" > 0);
