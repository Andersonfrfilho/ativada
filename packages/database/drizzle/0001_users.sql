CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"keycloak_sub" varchar(255) NOT NULL,
	"display_name" varchar(120),
	"display_currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"telegram_chat_id" varchar(32),
	"limits" jsonb DEFAULT '{"maxActiveLivePaperRuns":5,"maxConcurrentWalkForwards":1,"maxActivePriceAlerts":50}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"identity_deleted_at" timestamp with time zone,
	"data_purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_keycloak_sub_unique" ON "users" USING btree ("keycloak_sub");