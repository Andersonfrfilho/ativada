CREATE TABLE "model_team_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_key" varchar(8) NOT NULL,
	"provider" varchar(16) NOT NULL,
	"model_id" varchar(80) NOT NULL,
	"prompt_version" varchar(16) NOT NULL,
	"kind" varchar(12) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"timeframe" varchar(4) NOT NULL,
	"candle_time" bigint NOT NULL,
	"status" varchar(8) NOT NULL,
	"action" varchar(4),
	"entry_price" numeric,
	"target_price" numeric,
	"stop_price" numeric,
	"confidence" smallint,
	"roles" jsonb,
	"reason_hidden" boolean DEFAULT false NOT NULL,
	"input" jsonb,
	"prompt_hash" char(64),
	"raw_output" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"thinking_tokens" integer,
	"latency_ms" integer,
	"cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"reserved_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"failure_code" varchar(48),
	"attempt" smallint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_day" date DEFAULT (now() at time zone 'UTC')::date NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "model_team_reports_team_key_check" CHECK ("model_team_reports"."team_key" in ('nina', 'lucas', 'olivia')),
	CONSTRAINT "model_team_reports_provider_check" CHECK ("model_team_reports"."provider" in ('anthropic', 'google', 'openai')),
	CONSTRAINT "model_team_reports_prompt_version_check" CHECK ("model_team_reports"."prompt_version" in ('team-prompt-1')),
	CONSTRAINT "model_team_reports_kind_check" CHECK ("model_team_reports"."kind" in ('scheduled', 'on_demand')),
	CONSTRAINT "model_team_reports_timeframe_check" CHECK ("model_team_reports"."timeframe" in ('15m')),
	CONSTRAINT "model_team_reports_status_check" CHECK ("model_team_reports"."status" in ('pending', 'decided', 'failed', 'skipped')),
	CONSTRAINT "model_team_reports_action_check" CHECK ("model_team_reports"."action" in ('buy', 'sell', 'hold')),
	CONSTRAINT "model_team_reports_confidence_check" CHECK ("model_team_reports"."confidence" between 0 and 100),
	CONSTRAINT "model_team_reports_raw_output_check" CHECK (char_length("model_team_reports"."raw_output") <= 2048),
	CONSTRAINT "model_team_reports_decided_check" CHECK ("model_team_reports"."status" <> 'decided' or ("model_team_reports"."action" is not null and "model_team_reports"."confidence" is not null and "model_team_reports"."roles" is not null)),
	CONSTRAINT "model_team_reports_buy_levels_check" CHECK ("model_team_reports"."action" is distinct from 'buy' or ("model_team_reports"."entry_price" is not null and "model_team_reports"."target_price" is not null and "model_team_reports"."stop_price" is not null and "model_team_reports"."stop_price" < "model_team_reports"."entry_price" and "model_team_reports"."entry_price" < "model_team_reports"."target_price")),
	CONSTRAINT "model_team_reports_failure_code_check" CHECK ("model_team_reports"."status" not in ('failed', 'skipped') or "model_team_reports"."failure_code" is not null)
);
--> statement-breakpoint
CREATE TABLE "team_run_inputs" (
	"run_id" uuid NOT NULL,
	"candle_time" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"report_id" uuid,
	"failure_code" varchar(48),
	"applied_action" varchar(4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_run_inputs_pkey" PRIMARY KEY("run_id","candle_time"),
	CONSTRAINT "team_run_inputs_applied_action_check" CHECK ("team_run_inputs"."applied_action" in ('buy', 'sell', 'hold')),
	CONSTRAINT "team_run_inputs_source_check" CHECK ("team_run_inputs"."report_id" is not null or "team_run_inputs"."failure_code" is not null)
);
--> statement-breakpoint
CREATE TABLE "user_model_teams" (
	"user_id" uuid NOT NULL,
	"team_key" varchar(8) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"on_demand_day" date,
	"on_demand_count" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_model_teams_pkey" PRIMARY KEY("user_id","team_key"),
	CONSTRAINT "user_model_teams_team_key_check" CHECK ("user_model_teams"."team_key" in ('nina', 'lucas', 'olivia'))
);
--> statement-breakpoint
ALTER TABLE "worker_heartbeats" ADD COLUMN "model_teams" jsonb;--> statement-breakpoint
ALTER TABLE "team_run_inputs" ADD CONSTRAINT "team_run_inputs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_run_inputs" ADD CONSTRAINT "team_run_inputs_report_id_model_team_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."model_team_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_run_inputs" ADD CONSTRAINT "team_run_inputs_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_model_teams" ADD CONSTRAINT "user_model_teams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_team_reports_scheduled_unique" ON "model_team_reports" USING btree ("team_key","symbol","timeframe","candle_time","prompt_version") WHERE "model_team_reports"."kind" = 'scheduled';--> statement-breakpoint
CREATE INDEX "model_team_reports_pending" ON "model_team_reports" USING btree ("requested_at") WHERE "model_team_reports"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "model_team_reports_audit" ON "model_team_reports" USING btree ("symbol","team_key","candle_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "model_team_reports_day" ON "model_team_reports" USING btree ("requested_day");