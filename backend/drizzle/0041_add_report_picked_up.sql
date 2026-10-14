-- Spunta "Ritirato": il cliente ha ritirato il dispositivo. Come `alerted` è un semplice
-- flag, senza legame con `closed`; i report esistenti partono tutti da "no".
ALTER TABLE "report" ADD COLUMN IF NOT EXISTS "picked_up" boolean NOT NULL DEFAULT false;
