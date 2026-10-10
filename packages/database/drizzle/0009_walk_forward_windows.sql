CREATE TABLE "walk_forward_windows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"window_index" integer NOT NULL,
	"train_start" bigint NOT NULL,
	"train_end" bigint NOT NULL,
	"test_start" bigint NOT NULL,
	"test_end" bigint NOT NULL,
	"best_params" jsonb,
	"status" varchar(24) NOT NULL,
	"in_sample" jsonb NOT NULL,
	"out_of_sample" jsonb NOT NULL,
	"eligible_combinations" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walk_forward_windows_status_check" CHECK ("walk_forward_windows"."status" in ('ok', 'no_eligible_parameters')),
	CONSTRAINT "walk_forward_windows_index_check" CHECK ("walk_forward_windows"."window_index" >= 0),
	CONSTRAINT "walk_forward_windows_train_before_test_check" CHECK ("walk_forward_windows"."train_start" < "walk_forward_windows"."train_end" and "walk_forward_windows"."train_end" <= "walk_forward_windows"."test_start" and "walk_forward_windows"."test_start" < "walk_forward_windows"."test_end"),
	CONSTRAINT "walk_forward_windows_eligible_count_check" CHECK ("walk_forward_windows"."eligible_combinations" >= 0 and ("walk_forward_windows"."status" <> 'no_eligible_parameters' or "walk_forward_windows"."eligible_combinations" = 0)),
	CONSTRAINT "walk_forward_windows_params_match_status_check" CHECK (("walk_forward_windows"."status" = 'ok') = ("walk_forward_windows"."best_params" is not null))
);
--> statement-breakpoint
ALTER TABLE "walk_forward_windows" ADD CONSTRAINT "walk_forward_windows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_forward_windows" ADD CONSTRAINT "walk_forward_windows_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "walk_forward_windows_run_id_window_index_unique" ON "walk_forward_windows" USING btree ("run_id","window_index");--> statement-breakpoint
CREATE INDEX "walk_forward_windows_user_id_run_id_idx" ON "walk_forward_windows" USING btree ("user_id","run_id");