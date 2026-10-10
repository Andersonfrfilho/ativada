CREATE TABLE "equity_points" (
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"candle_time" bigint NOT NULL,
	"equity" numeric NOT NULL,
	"equity_at_low" numeric NOT NULL,
	"benchmark" numeric NOT NULL,
	CONSTRAINT "equity_points_run_id_candle_time_pk" PRIMARY KEY("run_id","candle_time")
);
--> statement-breakpoint
CREATE TABLE "fills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"order_key" varchar(64) NOT NULL,
	"position_key" varchar(64) NOT NULL,
	"candle_time" bigint NOT NULL,
	"side" varchar(8) NOT NULL,
	"price" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"notional" numeric NOT NULL,
	"fee" numeric NOT NULL,
	CONSTRAINT "fills_side_check" CHECK ("fills"."side" in ('buy', 'sell'))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"engine_key" varchar(64) NOT NULL,
	"side" varchar(8) NOT NULL,
	"type" varchar(8) NOT NULL,
	"purpose" varchar(8) NOT NULL,
	"status" varchar(16) NOT NULL,
	"reason" varchar(32),
	"quantity" numeric,
	"price" numeric,
	"limit_price" numeric,
	"trigger_price" numeric,
	"risk_amount" numeric,
	"stop_distance" numeric,
	"target_distance" numeric,
	"eligible_candles" integer,
	"created_candle_time" bigint NOT NULL,
	"expires_candle_time" bigint,
	"last_event_candle_time" bigint NOT NULL,
	CONSTRAINT "orders_side_check" CHECK ("orders"."side" in ('buy', 'sell')),
	CONSTRAINT "orders_type_check" CHECK ("orders"."type" in ('market', 'limit', 'stop', 'target')),
	CONSTRAINT "orders_purpose_check" CHECK ("orders"."purpose" in ('entry', 'exit')),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('created', 'filled', 'cancelled', 'expired', 'rejected')),
	CONSTRAINT "orders_reason_check" CHECK ("orders"."reason" is null or "orders"."reason" in ('below_min_notional', 'zero_atr', 'invalid_stop', 'opposite_signal', 'command', 'gap', 'volume_capped'))
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"engine_key" varchar(64) NOT NULL,
	"status" varchar(8) NOT NULL,
	"entry_price" numeric NOT NULL,
	"quantity" numeric NOT NULL,
	"stop_price" numeric NOT NULL,
	"target_price" numeric NOT NULL,
	"entry_fee" numeric NOT NULL,
	"exit_price" numeric,
	"exit_fee" numeric,
	"net_profit" numeric,
	"exit_reason" varchar(16),
	"opened_candle_time" bigint NOT NULL,
	"closed_candle_time" bigint,
	CONSTRAINT "positions_status_check" CHECK ("positions"."status" in ('open', 'closed')),
	CONSTRAINT "positions_exit_reason_check" CHECK ("positions"."exit_reason" is null or "positions"."exit_reason" in ('stop', 'target', 'signal', 'command', 'gap')),
	CONSTRAINT "positions_closed_has_exit_check" CHECK ("positions"."status" = 'open' or ("positions"."exit_price" is not null and "positions"."exit_fee" is not null and "positions"."net_profit" is not null and "positions"."exit_reason" is not null and "positions"."closed_candle_time" is not null))
);
--> statement-breakpoint
CREATE TABLE "run_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"command_id" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"reason" varchar(16) NOT NULL,
	"issued_at" bigint NOT NULL,
	"candle_time" bigint NOT NULL,
	"status" varchar(24) NOT NULL,
	CONSTRAINT "run_commands_kind_check" CHECK ("run_commands"."kind" in ('exit_position', 'halt', 'resume')),
	CONSTRAINT "run_commands_reason_check" CHECK ("run_commands"."reason" in ('goal_reached', 'goal_max_loss', 'goal_expired', 'user_stop', 'kill_switch', 'window_end', 'user_resume')),
	CONSTRAINT "run_commands_status_check" CHECK ("run_commands"."status" in ('applied', 'ignored_duplicate'))
);
--> statement-breakpoint
CREATE TABLE "sentiment_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"fear_greed" smallint NOT NULL,
	"observed_at" bigint NOT NULL,
	"source" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentiment_observations_fear_greed_range_check" CHECK ("sentiment_observations"."fear_greed" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"candle_time" bigint NOT NULL,
	"action" varchar(8) NOT NULL,
	"score" numeric NOT NULL,
	"regime" varchar(16) NOT NULL,
	"votes" jsonb NOT NULL,
	"indicators" jsonb NOT NULL,
	"sentiment_observation" jsonb,
	"reason" text NOT NULL,
	CONSTRAINT "signals_action_check" CHECK ("signals"."action" in ('BUY', 'SELL', 'HOLD')),
	CONSTRAINT "signals_regime_check" CHECK ("signals"."regime" in ('trending', 'ranging', 'none'))
);
--> statement-breakpoint
ALTER TABLE "equity_points" ADD CONSTRAINT "equity_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_points" ADD CONSTRAINT "equity_points_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_commands" ADD CONSTRAINT "run_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_commands" ADD CONSTRAINT "run_commands_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equity_points_user_id_run_id_idx" ON "equity_points" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fills_run_id_order_key_candle_time_unique" ON "fills" USING btree ("run_id","order_key","candle_time");--> statement-breakpoint
CREATE INDEX "fills_user_id_run_id_idx" ON "fills" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_run_id_engine_key_unique" ON "orders" USING btree ("run_id","engine_key");--> statement-breakpoint
CREATE INDEX "orders_user_id_run_id_idx" ON "orders" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_run_id_engine_key_unique" ON "positions" USING btree ("run_id","engine_key");--> statement-breakpoint
CREATE INDEX "positions_user_id_run_id_idx" ON "positions" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_commands_run_id_command_id_unique" ON "run_commands" USING btree ("run_id","command_id");--> statement-breakpoint
CREATE INDEX "run_commands_user_id_run_id_idx" ON "run_commands" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sentiment_observations_source_date_observed_at_unique" ON "sentiment_observations" USING btree ("source","date","observed_at");--> statement-breakpoint
CREATE INDEX "sentiment_observations_source_observed_at_idx" ON "sentiment_observations" USING btree ("source","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_run_id_candle_time_unique" ON "signals" USING btree ("run_id","candle_time");--> statement-breakpoint
CREATE INDEX "signals_user_id_run_id_idx" ON "signals" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE FUNCTION "sentiment_observations_reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'sentiment_observations é append-only: % não é permitido', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sentiment_observations_append_only_row" BEFORE UPDATE OR DELETE ON "sentiment_observations" FOR EACH ROW EXECUTE FUNCTION "sentiment_observations_reject_change"();--> statement-breakpoint
CREATE TRIGGER "sentiment_observations_append_only_truncate" BEFORE TRUNCATE ON "sentiment_observations" FOR EACH STATEMENT EXECUTE FUNCTION "sentiment_observations_reject_change"();
