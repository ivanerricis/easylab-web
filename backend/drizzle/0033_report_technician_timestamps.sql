ALTER TABLE "report_technician" ADD COLUMN "updated_at" timestamp;
--> statement-breakpoint
ALTER TABLE "report_technician" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
