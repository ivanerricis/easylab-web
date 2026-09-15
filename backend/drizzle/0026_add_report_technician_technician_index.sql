-- La chiave primaria di `report_technician` è il solo `report_id` (migration 0004): copre la
-- ricerca per report, non quella per tecnico. La scheda del tecnico filtra i report proprio su
-- `technician_id`, e Postgres ci passa anche a ogni eliminazione di un tecnico per controllare la
-- chiave esterna: senza questo indice, entrambe leggevano la tabella intera.
CREATE INDEX IF NOT EXISTS "report_technician_technician_id_idx" ON "report_technician" USING btree ("technician_id");
