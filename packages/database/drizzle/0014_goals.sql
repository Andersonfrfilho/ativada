CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"target_rate" numeric NOT NULL,
	"horizon_days" integer NOT NULL,
	"max_loss_rate" numeric NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "goals_symbol_check" CHECK ("goals"."symbol" ~ '^[A-Z0-9]{2,16}USDT$'),
	CONSTRAINT "goals_target_rate_check" CHECK ("goals"."target_rate" > 0 and "goals"."target_rate" <= 10),
	CONSTRAINT "goals_max_loss_rate_check" CHECK ("goals"."max_loss_rate" > 0 and "goals"."max_loss_rate" < 1),
	CONSTRAINT "goals_horizon_days_check" CHECK ("goals"."horizon_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_id_created_at_idx" ON "goals" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);