-- Array JSON delle etichette dispositivo (`describeUserAgent`, es. "Chrome su Windows") già
-- viste per l'utente, per riconoscere un accesso da un dispositivo mai usato prima e avvisare
-- l'email del laboratorio (vedi `authManager.notifyIfNewDevice`). Nullable: NULL equivale ad
-- array vuoto, nessun dispositivo ancora noto (tutti gli utenti esistenti, al momento della
-- migrazione).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "known_device_labels" text;
