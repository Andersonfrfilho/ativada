ALTER TABLE "runs" ADD COLUMN "claimed_by" varchar(64);--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "runs_queued_created_at_idx" ON "runs" USING btree ("created_at","id") WHERE "runs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "runs_running_heartbeat_idx" ON "runs" USING btree ("heartbeat_at") WHERE "runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "runs_user_id_started_at_idx" ON "runs" USING btree ("user_id","started_at" DESC NULLS LAST) WHERE "runs"."started_at" is not null;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_claim_only_when_running_check" CHECK ("runs"."claimed_by" is null or "runs"."status" = 'running');