-- L'unicità di nome dispositivo e descrizione difetto era case-sensitive (vincolo di Postgres
-- su UNIQUE("name")/UNIQUE("description")): "iPhone 13" e "iphone 13" potevano convivere come
-- due voci distinte nel catalogo. Il confronto sul difetto "Altro" (issueCatalog.ts) è già senza
-- maiuscole/minuscole e presume che non esista un duplicato del genere: questo lo garantisce a
-- livello di database anche per tutte le altre voci.
ALTER TABLE "device" DROP CONSTRAINT "device_name_unique";--> statement-breakpoint
ALTER TABLE "issue" DROP CONSTRAINT "issue_description_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "device_name_lower_idx" ON "device" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "issue_description_lower_idx" ON "issue" USING btree (lower("description"));
