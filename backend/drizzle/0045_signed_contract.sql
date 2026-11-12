-- Il contratto firmato dal cliente, caricato a mano come PDF: al più uno per contratto (la
-- chiave primaria è anche la chiave esterna), sostituibile ed eliminabile. Qui ci sono solo i
-- dati del file; il PDF sta in `data/signed-contracts/<contract_id>.pdf`, fuori dal database,
-- e la cartella entra nei backup insieme al dump (`backupFiles.ts`). Con il contratto se ne va
-- anche la riga; il file lo cancella la rotta.
CREATE TABLE "signed_contract" (
	"contract_id" integer PRIMARY KEY NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signed_contract_size_bytes_check" CHECK ("signed_contract"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "signed_contract" ADD CONSTRAINT "signed_contract_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE cascade ON UPDATE no action;
