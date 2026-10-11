-- Desfaz 0016: a espera por dado da simulação ao vivo (colunas e CHECKs de `runs`).
ALTER TABLE "runs" DROP CONSTRAINT "runs_waiting_failed_recoveries_check";--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_waiting_pair_check";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "waiting_last_recovery_at";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "waiting_failed_recoveries";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "waiting_open_time";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "waiting_since";
