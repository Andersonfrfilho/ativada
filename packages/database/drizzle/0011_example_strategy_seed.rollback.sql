-- Desfaz 0011: a marca de semeadura da estratégia de exemplo e o índice de uma estratégia de exemplo por usuário.
DROP INDEX "strategies_user_id_example_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "example_strategy_seeded_at";
