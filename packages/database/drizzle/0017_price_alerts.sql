CREATE TABLE "price_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"value" numeric NOT NULL,
	"origin" varchar(8) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_alerts_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "price_alerts_symbol_check" CHECK ("price_alerts"."symbol" ~ '^[A-Z0-9]{2,16}USDT$'),
	CONSTRAINT "price_alerts_direction_check" CHECK ("price_alerts"."direction" in ('above', 'below')),
	CONSTRAINT "price_alerts_origin_check" CHECK ("price_alerts"."origin" in ('manual', 'plan')),
	CONSTRAINT "price_alerts_value_check" CHECK ("price_alerts"."value" > 0),
	CONSTRAINT "price_alerts_triggered_is_disabled_check" CHECK ("price_alerts"."triggered_at" is null or not "price_alerts"."is_enabled")
);
--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_alerts_user_id_created_at_idx" ON "price_alerts" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "price_alerts_armed_symbol_idx" ON "price_alerts" USING btree ("symbol") WHERE "price_alerts"."is_enabled" and "price_alerts"."triggered_at" is null;