-- Spec 015, adendo (ADR 0002): a pergunta livre de um usuário a uma equipe de modelo. Tabela nova, do dono (LGPD), aditiva.
CREATE TABLE "model_team_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"team_key" varchar(8) NOT NULL,
	"provider" varchar(16) NOT NULL,
	"model_id" varchar(80),
	"symbol" varchar(20) NOT NULL,
	"question" text NOT NULL,
	"status" varchar(8) NOT NULL,
	"answer" text,
	"failure_code" varchar(48),
	"input_tokens" integer,
	"output_tokens" integer,
	"thinking_tokens" integer,
	"latency_ms" integer,
	"cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"reserved_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_day" date DEFAULT (now() at time zone 'UTC')::date NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "model_team_questions_team_key_check" CHECK ("model_team_questions"."team_key" in ('nina', 'lucas', 'olivia')),
	CONSTRAINT "model_team_questions_provider_check" CHECK ("model_team_questions"."provider" in ('anthropic', 'google', 'openai')),
	CONSTRAINT "model_team_questions_status_check" CHECK ("model_team_questions"."status" in ('pending', 'answered', 'failed', 'hidden')),
	CONSTRAINT "model_team_questions_question_check" CHECK (char_length("model_team_questions"."question") between 3 and 280),
	CONSTRAINT "model_team_questions_answer_check" CHECK (char_length("model_team_questions"."answer") <= 600),
	CONSTRAINT "model_team_questions_answered_check" CHECK ("model_team_questions"."status" not in ('answered', 'hidden') or "model_team_questions"."answer" is not null),
	CONSTRAINT "model_team_questions_failure_code_check" CHECK ("model_team_questions"."status" <> 'failed' or "model_team_questions"."failure_code" is not null)
);
--> statement-breakpoint
ALTER TABLE "model_team_questions" ADD CONSTRAINT "model_team_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_team_questions" ADD CONSTRAINT "model_team_questions_run_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_team_questions_pending" ON "model_team_questions" USING btree ("requested_at") WHERE "model_team_questions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "model_team_questions_run" ON "model_team_questions" USING btree ("run_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "model_team_questions_user_day" ON "model_team_questions" USING btree ("user_id","requested_day");--> statement-breakpoint
CREATE INDEX "model_team_questions_day" ON "model_team_questions" USING btree ("requested_day");