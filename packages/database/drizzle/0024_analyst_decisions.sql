CREATE TABLE "analyst_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"candle_time" bigint NOT NULL,
	"version" varchar(16) NOT NULL,
	"mode" varchar(8) NOT NULL,
	"status" varchar(8) NOT NULL,
	"posture" varchar(16),
	"reason" varchar(32),
	"cadence_minutes" smallint,
	"entry_gate" varchar(8),
	"risk_scale" numeric,
	"time_exit_due" boolean,
	"forecast" jsonb,
	"readings" jsonb,
	"specialists" jsonb,
	"locks" jsonb,
	"commands" jsonb,
	"message" text,
	"failure_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyst_decisions_version_check" CHECK ("analyst_decisions"."version" in ('analyst-1')),
	CONSTRAINT "analyst_decisions_mode_check" CHECK ("analyst_decisions"."mode" in ('shadow', 'govern')),
	CONSTRAINT "analyst_decisions_status_check" CHECK ("analyst_decisions"."status" in ('decided', 'failed')),
	CONSTRAINT "analyst_decisions_posture_check" CHECK ("analyst_decisions"."posture" in ('pause', 'caution', 'normal', 'confident')),
	CONSTRAINT "analyst_decisions_cadence_check" CHECK ("analyst_decisions"."cadence_minutes" in (15, 60, 240)),
	CONSTRAINT "analyst_decisions_entry_gate_check" CHECK ("analyst_decisions"."entry_gate" in ('open', 'closed')),
	CONSTRAINT "analyst_decisions_risk_scale_check" CHECK ("analyst_decisions"."risk_scale" in (0, 0.25, 0.5, 1)),
	CONSTRAINT "analyst_decisions_coherence_check" CHECK (("analyst_decisions"."status" = 'decided' and "analyst_decisions"."posture" is not null and "analyst_decisions"."cadence_minutes" is not null and "analyst_decisions"."entry_gate" is not null and "analyst_decisions"."risk_scale" is not null) or ("analyst_decisions"."status" = 'failed' and "analyst_decisions"."failure_code" is not null))
);
--> statement-breakpoint
ALTER TABLE "analyst_decisions" ADD CONSTRAINT "analyst_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_decisions" ADD CONSTRAINT "analyst_decisions_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analyst_decisions_run_id_candle_time_unique" ON "analyst_decisions" USING btree ("run_id","candle_time");--> statement-breakpoint
CREATE INDEX "analyst_decisions_user_id_run_id_candle_time_idx" ON "analyst_decisions" USING btree ("user_id","run_id","candle_time" DESC NULLS LAST);