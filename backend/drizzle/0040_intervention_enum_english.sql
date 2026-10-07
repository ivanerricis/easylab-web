-- I valori salvati di tipo e stato dell'intervento passano dall'italiano all'inglese, come
-- già fatto per i report (`cash`/`card`): il dato resta un identificatore tecnico, le etichette
-- italiane mostrate all'utente vivono solo nel codice (`interventionLabels.ts`, frontend).
-- Le due colonne erano anche prive di vincolo: la lista dei valori ammessi esisteva solo in
-- TypeScript, quindi una scrittura diretta poteva salvarne uno qualunque. Qui la riscriviamo
-- una volta sola e aggiungiamo i CHECK, così il database stesso rifiuta i valori sconosciuti.
--
-- Un valore non riconosciuto resta com'è nell'UPDATE (ELSE "type"/"status"), apposta: il CHECK
-- sotto fallisce in modo rumoroso invece di riscrivere in silenzio un dato che non conosciamo.
-- Il migrator applica tutte le migrazioni pendenti in un'unica transazione, quindi in quel caso
-- va tutto in rollback e il database resta com'era, senza corruzione né perdita di dati.
--
-- ATTENZIONE PRIMA DI ESEGUIRE QUESTA MIGRAZIONE IN PRODUZIONE: un operatore deve controllare,
-- in sola lettura, che esistano solo i valori attesi:
--
--   SELECT type, status, count(*) FROM intervention GROUP BY 1, 2;
--
-- Devono comparire solo consegna_materiale / intervento_sede / intervento_remoto per il tipo e
-- programmato / in_lavorazione / completato per lo stato. Se compare altro, va sistemato a mano
-- prima di distribuire.
UPDATE "intervention" SET
    "type" = CASE "type"
        WHEN 'consegna_materiale' THEN 'material_delivery'
        WHEN 'intervento_sede' THEN 'customer_site'
        WHEN 'intervento_remoto' THEN 'remote'
        ELSE "type"
    END,
    "status" = CASE "status"
        WHEN 'programmato' THEN 'scheduled'
        WHEN 'in_lavorazione' THEN 'in_progress'
        WHEN 'completato' THEN 'completed'
        ELSE "status"
    END;--> statement-breakpoint
ALTER TABLE "intervention" ALTER COLUMN "status" SET DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_type_check" CHECK ("intervention"."type" IN ('material_delivery', 'customer_site', 'remote'));--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_status_check" CHECK ("intervention"."status" IN ('scheduled', 'in_progress', 'completed'));
