-- L'unico indizio sul dispositivo che il browser manda da sé: serve a riconoscere la propria
-- sessione in un elenco dove, altrimenti, tutte le righe si assomigliano. Resta nullable: le
-- sessioni già aperte non l'hanno mai inviato a nessuno, e nell'interfaccia risultano
-- "Dispositivo sconosciuto" finché non scadono.
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "user_agent" varchar(255);
