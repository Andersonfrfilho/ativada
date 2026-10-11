ALTER TABLE "runs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "runs_user_id_stored_idx" ON "runs" USING btree ("user_id") WHERE "runs"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_deleted_is_terminal_check" CHECK ("runs"."deleted_at" is null or "runs"."status" in ('completed', 'failed', 'cancelled'));