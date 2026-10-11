ALTER TABLE "runs" ADD COLUMN "waiting_since" bigint;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "waiting_open_time" bigint;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "waiting_failed_recoveries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "waiting_last_recovery_at" bigint;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_waiting_pair_check" CHECK (("runs"."waiting_since" is null) = ("runs"."waiting_open_time" is null));--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_waiting_failed_recoveries_check" CHECK ("runs"."waiting_failed_recoveries" >= 0);