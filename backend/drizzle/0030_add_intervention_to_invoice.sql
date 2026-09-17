ALTER TABLE "intervention" ADD COLUMN IF NOT EXISTS "to_invoice" boolean NOT NULL DEFAULT false;
