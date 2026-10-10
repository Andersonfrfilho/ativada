-- Desfaz 0012: posse e batimento das execuções reivindicadas pela fila, com os índices e o CHECK que os acompanham.
ALTER TABLE "runs" DROP CONSTRAINT "runs_claim_only_when_running_check";--> statement-breakpoint
DROP INDEX "runs_user_id_started_at_idx";--> statement-breakpoint
DROP INDEX "runs_running_heartbeat_idx";--> statement-breakpoint
DROP INDEX "runs_queued_created_at_idx";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "heartbeat_at";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "claimed_by";
