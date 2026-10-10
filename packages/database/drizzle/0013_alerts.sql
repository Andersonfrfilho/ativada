CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"candle_time" bigint NOT NULL,
	"side" varchar(8) NOT NULL,
	"channel" varchar(16) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "alerts_side_check" CHECK ("alerts"."side" in ('BUY', 'SELL')),
	CONSTRAINT "alerts_channel_check" CHECK ("alerts"."channel" in ('telegram')),
	CONSTRAINT "alerts_status_check" CHECK ("alerts"."status" in ('pending', 'sent', 'failed', 'skipped')),
	CONSTRAINT "alerts_attempts_check" CHECK ("alerts"."attempts" >= 0),
	CONSTRAINT "alerts_sent_matches_status_check" CHECK (("alerts"."status" = 'sent') = ("alerts"."sent_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_run_id_candle_time_side_channel_unique" ON "alerts" USING btree ("run_id","candle_time","side","channel");--> statement-breakpoint
CREATE INDEX "alerts_user_id_created_at_idx" ON "alerts" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alerts_pending_next_attempt_idx" ON "alerts" USING btree ("next_attempt_at") WHERE "alerts"."status" = 'pending';