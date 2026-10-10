CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"timeframe" varchar(8) NOT NULL,
	"run_parameters" jsonb NOT NULL,
	"run_hash" varchar(64) NOT NULL,
	"engine_version" varchar(32) NOT NULL,
	"signal_engine_version" varchar(32) NOT NULL,
	"metrics_version" varchar(32) NOT NULL,
	"period_start" bigint NOT NULL,
	"period_end" bigint,
	"engine_state" jsonb,
	"last_candle_time" bigint,
	"metrics" jsonb,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(64),
	"migrated_from_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "runs_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "runs_kind_check" CHECK ("runs"."kind" in ('backtest', 'walk_forward', 'live_paper')),
	CONSTRAINT "runs_status_check" CHECK ("runs"."status" in ('queued', 'running', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "runs_timeframe_check" CHECK ("runs"."timeframe" in ('15m', '1h', '4h', '1d')),
	CONSTRAINT "runs_progress_range_check" CHECK ("runs"."progress" between 0 and 100),
	CONSTRAINT "runs_period_order_check" CHECK ("runs"."period_end" is null or "runs"."period_end" > "runs"."period_start"),
	CONSTRAINT "runs_finished_matches_terminal_status_check" CHECK (("runs"."status" in ('completed', 'failed', 'cancelled')) = ("runs"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_example" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "strategies_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "strategies_name_not_blank_check" CHECK (length(btrim("strategies"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"config_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_versions_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "strategy_versions_version_positive_check" CHECK ("strategy_versions"."version" >= 1),
	CONSTRAINT "strategy_versions_config_hash_format_check" CHECK ("strategy_versions"."config_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_strategy_version_id_user_id_fk" FOREIGN KEY ("strategy_version_id","user_id") REFERENCES "public"."strategy_versions"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_migrated_from_run_id_user_id_fk" FOREIGN KEY ("migrated_from_run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_user_id_fk" FOREIGN KEY ("strategy_id","user_id") REFERENCES "public"."strategies"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_user_id_created_at_id_idx" ON "runs" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_strategy_version_id_user_id_idx" ON "runs" USING btree ("strategy_version_id","user_id");--> statement-breakpoint
CREATE INDEX "runs_migrated_from_run_id_idx" ON "runs" USING btree ("migrated_from_run_id") WHERE "runs"."migrated_from_run_id" is not null;--> statement-breakpoint
CREATE INDEX "strategies_user_id_created_at_idx" ON "strategies" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_strategy_id_version_unique" ON "strategy_versions" USING btree ("strategy_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_strategy_id_config_hash_unique" ON "strategy_versions" USING btree ("strategy_id","config_hash");--> statement-breakpoint
CREATE INDEX "strategy_versions_user_id_strategy_id_idx" ON "strategy_versions" USING btree ("user_id","strategy_id");