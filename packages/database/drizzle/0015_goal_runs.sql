ALTER TABLE "alerts" DROP CONSTRAINT "alerts_side_check";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "goal_outcome" varchar(16);--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "goal_outcome_candle_time" bigint;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_goal_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_goal_id_idx" ON "runs" USING btree ("goal_id") WHERE "runs"."goal_id" is not null;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_side_check" CHECK ("alerts"."side" in ('BUY', 'SELL', 'GOAL'));--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_goal_outcome_check" CHECK ("runs"."goal_outcome" is null or "runs"."goal_outcome" in ('goal_reached', 'goal_stopped', 'goal_expired'));--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_goal_outcome_pair_check" CHECK (("runs"."goal_outcome" is null) = ("runs"."goal_outcome_candle_time" is null));--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_goal_outcome_needs_goal_check" CHECK ("runs"."goal_outcome" is null or "runs"."goal_id" is not null);--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_goal_only_live_check" CHECK ("runs"."goal_id" is null or "runs"."kind" = 'live_paper');