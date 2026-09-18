-- Il tecnico esterno è un attributo del report (una riga al più, chiave primaria `report_id` dalla
-- 0004), ma la chiave esterna verso `report` era rimasta "no action": eliminare un report che aveva
-- un tecnico falliva con "è ancora assegnato a uno o più tecnici", e nessun punto dell'app toglieva
-- prima quella riga. Con la cascata la riga se ne va insieme al suo report.
ALTER TABLE "report_technician" DROP CONSTRAINT "report_technician_report_id_report_id_fk";--> statement-breakpoint
ALTER TABLE "report_technician" ADD CONSTRAINT "report_technician_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;
