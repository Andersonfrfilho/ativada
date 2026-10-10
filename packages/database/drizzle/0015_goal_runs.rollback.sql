-- Desfaz 0015: a simulação ligada a uma meta (coluna, FK, índice, CHECKs) e o alerta de desfecho da meta.
DELETE FROM "alerts" WHERE "side" = 'GOAL';--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_side_check";--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_side_check" CHECK ("alerts"."side" in ('BUY', 'SELL'));--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_goal_only_live_check";--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_goal_outcome_needs_goal_check";--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_goal_outcome_pair_check";--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_goal_outcome_check";--> statement-breakpoint
DROP INDEX "runs_goal_id_idx";--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_goal_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "goal_outcome_candle_time";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "goal_outcome";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "goal_id";
