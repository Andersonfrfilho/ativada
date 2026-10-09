CREATE TABLE "telegram_link_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_link_codes_code_hash_unique" ON "telegram_link_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_link_codes_user_id_unique" ON "telegram_link_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_chat_id_unique" ON "users" USING btree ("telegram_chat_id") WHERE "users"."telegram_chat_id" is not null;