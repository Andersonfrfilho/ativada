CREATE TABLE "user_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"quantity" numeric NOT NULL,
	"average_price" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_assets_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "user_assets_user_id_symbol_unique" UNIQUE("user_id","symbol"),
	CONSTRAINT "user_assets_symbol_check" CHECK ("user_assets"."symbol" ~ '^[A-Z0-9]{2,16}USDT$'),
	CONSTRAINT "user_assets_quantity_check" CHECK ("user_assets"."quantity" >= 0),
	CONSTRAINT "user_assets_average_price_check" CHECK ("user_assets"."average_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;