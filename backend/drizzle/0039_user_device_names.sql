-- Identità del dispositivo, per dargli un nome che sopravviva ai login: la sessione dura al
-- massimo sette giorni e muore al logout, il dispositivo (un cookie di lunga durata) no.
-- `session.device_hash` è lo sha256 dell'identificativo nel cookie (NULL per le sessioni già
-- aperte, che non lo hanno); `user_device` tiene il nome, una riga per (utente, dispositivo).
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "device_hash" varchar(64);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_device" (
	"user_id" integer NOT NULL,
	"device_hash" varchar(64) NOT NULL,
	"name" varchar(60) NOT NULL,
	"updated_at" timestamp DEFAULT null,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_device_user_id_device_hash_pk" PRIMARY KEY("user_id","device_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_device" ADD CONSTRAINT "user_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
